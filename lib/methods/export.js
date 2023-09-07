const _ = require('lodash');
const { EJSON } = require('bson');

const MAX_RECURSION = 10;

module.exports = self => {
  return {
    async export(req, manager, reporting = null) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      if (reporting) {
        reporting.setTotal(req.body._ids.length);
      }

      const ids = self.apos.launder.ids(req.body._ids);
      const relatedTypes = self.apos.launder.strings(req.body.relatedTypes);
      const expiration = self.options.importExport?.export?.expiration &&
        self.apos.launder.integer(self.options.export.expiration);

      const [ defaultFormatName ] = Object.keys(self.formats);
      const formatName = self.apos.launder.string(req.body.formatName, defaultFormatName);

      const format = self.formats[formatName];
      if (!format) {
        throw self.apos.error('invalid');
      }

      const hasRelatedTypes = !!relatedTypes.length;
      const docs = await self.getDocs(req, ids, hasRelatedTypes, manager, reporting);
      const cleanDocs = self.clean(docs);

      if (!hasRelatedTypes) {
        return self.createArchive(
          req,
          reporting,
          self.formatArchiveData(cleanDocs),
          {
            expiration,
            format
          }
        );
      }

      const relatedDocs = docs.flatMap(doc =>
        self.getRelatedDocsFromSchema(req, {
          doc,
          schema: self.apos.modules[doc.type].schema,
          relatedTypes
        })
      );
      cleanDocs.push(...self.clean(relatedDocs));

      const attachmentsIds = _
        .uniqBy([ ...docs, ...relatedDocs ], doc => doc._id)
        .flatMap(doc =>
          self.getRelatedDocsFromSchema(req, {
            doc,
            schema: self.apos.modules[doc.type].schema,
            type: 'attachment'
          })
        )
        .map(attachment => attachment._id);

      const attachments = await self.getAttachments(req, attachmentsIds);
      const cleanAttachments = self.clean(attachments);

      const attachmentUrls = Object.fromEntries(
        attachments.map(attachment => {
          const name = `${attachment._id}-${attachment.name}.${attachment.extension}`;
          return [ name, self.apos.attachment.url(attachment, { size: 'original' }) ];
        })
      );

      return self.createArchive(
        req,
        reporting,
        self.formatArchiveData(cleanDocs, cleanAttachments, attachmentUrls),
        {
          expiration,
          format
        }
      );
    },

    // Get docs via their manager in order to populate them
    // so that we can retrieve their relationships IDs later,
    // and to let the manager handle permissions.
    async getDocs(req, docsIds, includeRelationships, manager, reporting) {
      if (!docsIds.length) {
        return [];
      }

      const draftAndPublishedIds = self.getAllModesIds(docsIds);

      /* const draftReq = req.clone({ mode: 'draft' }); */
      /* console.dir(req, { depth: 0 }); */
      /* console.log('req.mode', draftReq.mode); */
      /* const draftReq = self.apos.task.getReq({ mode: 'draft' }); */
      const draftDocs = await manager
        .findForEditing(req, {
          _id: {
            $in: draftAndPublishedIds
          }
        })
        .relationships(includeRelationships)
        .toArray();

      /* const publishedReq = self.apos.task.getReq({ mode: 'published' }); */
      const publishedDocs = await manager
        .findForEditing(req, {
          _id: {
            $in: draftAndPublishedIds
          }
        })
        .relationships(includeRelationships)
        .toArray();

      /* const [ draftDocs, publishedDocs ] = await Promise.all([ draftDocsPromise, publishedDocsPromise ]); */
      console.log('=====> draftDocs <=====');
      draftDocs.forEach((doc) => {
        console.dir(doc.main, { depth: 4 });
      });
      console.log('=====> pulblishedDocs <=====');
      publishedDocs.forEach((doc) => {
        console.dir(doc.main, { depth: 4 });
      });

      const docs = [ ...draftDocs, ...publishedDocs ];

      if (reporting) {
        const docsId = docs.map(doc => doc._id);

        // Verify that each id sent in the body has its corresponding doc fetched
        docsIds.forEach(id => {
          const fn = docsId.includes(id)
            ? 'success'
            : 'failure';

          reporting[fn]();
        });
      }

      return docs.filter(doc => self.canExport(req, doc.type));
    },

    // Add the published version ID next to each draft ID,
    // so we always get both the draft and the published ID.
    // If somehow published IDs are sent from the frontend,
    // that will not be an issue thanks to this method.
    getAllModesIds(ids) {
      return ids.flatMap(id => [
        id.replace(':published', ':draft'),
        id.replace(':draft', ':published')
      ]);
    },

    // Filter our docs which module has the export option disabled
    // and clone them in order to get clean data for the export (no scalar data).
    clean(docs) {
      if (!docs.length) {
        return [];
      }

      return _
        .uniqBy(docs, doc => doc._id)
        .map(doc => self.apos.util.clonePermanent(doc));
    },

    getAttachments(req, ids) {
      if (!ids.length) {
        return [];
      }

      return self.apos.attachment.db
        .find({
          _id: {
            $in: ids
          }
        })
        .toArray();
    },

    canImport(req, docType) {
      return self.canImportOrExport(req, docType, 'import');
    },

    canExport(req, docType) {
      return self.canImportOrExport(req, docType, 'export');
    },

    // Filter our docs that have their module with the import or export option set to false
    // and docs that have "admin only" permissions when the user is not an admin.
    // If a user does not have at lease the permission to view the draft, he won't
    // be able to import or export it.
    canImportOrExport(req, docType, action) {
      const docModule = self.apos.modules[docType];

      if (!docModule) {
        return false;
      }

      if (docModule.options.importExport?.[action] === false) {
        return false;
      }

      if (!self.apos.permission.can(req, 'view', docType)) {
        return false;
      }

      return true;
    },

    formatArchiveData(docs, attachments = [], urls = {}) {
      return {
        json: {
          'aposDocs.json': EJSON.stringify(docs, undefined, 2),
          'aposAttachments.json': EJSON.stringify(attachments, undefined, 2)
        },
        attachments: urls
      };
    },

    getRelatedDocsFromSchema(
      req,
      {
        doc,
        schema,
        type = 'relationship',
        relatedTypes,
        recursion = 0
      }
    ) {
      return schema.flatMap(field => {
        const fieldValue = doc[field.name];
        const shouldRecurse = recursion <= MAX_RECURSION;

        if (!fieldValue) {
          return [];
        }
        if (field.withType && relatedTypes && !relatedTypes.includes(field.withType)) {
          return [];
        }
        if (field.withType && !self.canExport(req, field.withType)) {
          return [];
        }

        if (shouldRecurse && field.type === 'array') {
          return fieldValue.flatMap((subField) => self.getRelatedDocsFromSchema(req, {
            doc: subField,
            schema: field.schema,
            type,
            relatedTypes,
            recursion: recursion + 1
          }));
        }

        if (shouldRecurse && field.type === 'object') {
          return self.getRelatedDocsFromSchema(req, {
            doc: fieldValue,
            schema: field.schema,
            type,
            relatedTypes,
            recursion: recursion + 1
          });
        }

        if (shouldRecurse && field.type === 'area') {
          return (fieldValue.items || []).flatMap((widget) => self.getRelatedDocsFromSchema(req, {
            doc: widget,
            schema: self.apos.modules[`${widget?.type}-widget`]?.schema || [],
            type,
            relatedTypes,
            recursion: recursion + 1
          }));
        }

        if (field.type === type) {
          return Array.isArray(fieldValue) ? fieldValue : [ fieldValue ];
        }

        return [];
      });
    }
  };
};
