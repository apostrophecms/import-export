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
      const extension = self.apos.launder.string(req.body.extension, 'zip');
      const expiration = typeof self.options.export === 'object' &&
        self.apos.launder.integer(self.options.export.expiration);

      const format = self.exportFormats[extension];

      if (!format) {
        throw self.apos.error('invalid');
      }

      const allIds = self.getAllModesIds(ids);

      if (!relatedTypes.length) {
        const docs = await self.fetchActualDocs(req, allIds, reporting);

        return self.createArchive(req, reporting, this.formatArchiveData(docs), {
          extension,
          expiration,
          format
        });
      }

      const draftDocs = await self.getPopulatedDocs(req, manager, allIds, 'draft');
      const publishedDocs = await self.getPopulatedDocs(req, manager, allIds, 'published');

      // Get related docs id from BOTH the draft and published docs,
      // since they might have different related documents.
      const relatedIds = draftDocs
        .concat(publishedDocs)
        .flatMap(doc => {
          return self.getRelatedIdsBySchema({
            doc,
            schema: self.apos.modules[doc.type].schema,
            relatedTypes
          });
        });

      const allRelatedIds = self.getAllModesIds(relatedIds);

      const docs = await self.fetchActualDocs(req, [ ...allIds, ...allRelatedIds ], reporting);

      const attachmentsIds = docs.flatMap(doc => {
        return self.getRelatedIdsBySchema({
          doc,
          schema: self.apos.modules[doc.type].schema,
          type: 'attachment'
        });
      });
      const attachments = await self.fetchActualDocs(req, attachmentsIds, reporting, 'attachment');
      const attachmentUrls = Object.fromEntries(
        attachments.map((attachment) => {
          const name = `${attachment._id}-${attachment.name}.${attachment.extension}`;
          return [ name, self.apos.attachment.url(attachment, { size: 'original' }) ];
        })
      );

      return self.createArchive(req,
        reporting,
        self.formatArchiveData(docs, attachments, attachmentUrls),
        {
          extension,
          expiration,
          format
        }
      );
    },

    formatArchiveData(docs, attachments = [], urls = {}) {
      return {
        json: {
          'aposDocs.json': JSON.stringify(docs, undefined, 2),
          'aposAttachments.json': JSON.stringify(attachments, undefined, 2)
        },
        attachments: urls
      };
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

    // Fetch the documents exactly as they are in the database,
    // without altering the fields or populating them, as the managers would.
    // It is ok if docs corresponding to published IDs do not exist in the database,
    // as they simply will not be fetched.
    async fetchActualDocs(req, docsIds, reporting, collection = 'doc') {
      if (!docsIds.length) {
        return [];
      }

      const docsIdsUniq = [ ...new Set(docsIds) ];
      const docs = await self.apos[collection].db
        .find({
          _id: {
            $in: docsIdsUniq
          }
        })
        .toArray();

      // FIXME: seems like reporting is not working very well,
      // when calling failure on purpose, we have the progress bar
      // at 200%... 🤷‍♂️
      if (reporting) {
        const { _ids } = req.body;
        const docsId = docs.map(doc => doc._id);

        // Verify that each id sent in the body has its corresponding doc fetched
        _ids.forEach(id => {
          const fn = docsId.includes(id)
            ? 'success'
            : 'failure';

          reporting[fn]();
        });
      }

      return docs.filter(doc => self.canExportDoc(req, doc.type));
    },

    // Filter our docs that have their module with the `export` option set to false
    // and docs that have "admin only" permissions when the user is not an admin.
    // If a user does not have at lease the permission to view the draft, he won't
    // be able to download it.
    canExportDoc(req, docType) {
      const docModule = self.apos.modules[docType];
      if (!docModule) {
        return false;
      }

      if (docModule.options.export === false) {
        return false;
      }

      const isAdminOnly =
        docModule.options.viewRole === 'admin' ||
        docModule.options.editRole === 'admin' ||
        docModule.options.publishRole === 'admin';

      if (isAdminOnly && req.user.role !== 'admin') {
        return false;
      }

      if (!self.apos.permission.can(req, 'view-draft', docType)) {
        return false;
      }

      return true;
    },

    // Get docs via their manager in order to populate them
    // so that we can retrieve their relationships IDs later.
    getPopulatedDocs(req, manager, docsIds, mode) {
      return manager
        .find(req.clone({ mode }), {
          _id: {
            $in: docsIds
          }
        })
        .toArray();
    },

    getRelatedIdsBySchema({
      doc, schema, type = 'relationship', relatedTypes, recursion = 0
    }) {
      return schema.flatMap(field => {
        const fieldValue = doc[field.name];
        const shouldRecurse = recursion <= MAX_RECURSION;

        if (
          !fieldValue ||
          (relatedTypes && field.withType && !relatedTypes.includes(field.withType))
          // TODO: handle 'importExport.export: false' option
          /* ( */
          /*   type === 'relationship' && */
          /*   field.withType && */
          /*   self.apos.modules[field.withType].options.relatedDocument === false */
          /* ) */
        ) {
          return [];
        }

        if (shouldRecurse && field.type === 'array') {
          return fieldValue.flatMap((subField) => self.getRelatedIdsBySchema({
            doc: subField,
            schema: field.schema,
            type,
            relatedTypes,
            recursion: recursion + 1
          }));
        }

        if (shouldRecurse && field.type === 'object') {
          return self.getRelatedIdsBySchema({
            doc: fieldValue,
            schema: field.schema,
            type,
            relatedTypes,
            recursion: recursion + 1
          });
        }

        if (shouldRecurse && field.type === 'area') {
          return (fieldValue.items || []).flatMap((widget) => self.getRelatedIdsBySchema({
            doc: widget,
            schema: self.apos.modules[`${widget?.type}-widget`]?.schema || [],
            type,
            relatedTypes,
            recursion: recursion + 1
          }));
        }

        if (field.type === type) {
          return Array.isArray(fieldValue)
            ? fieldValue.map(({ _id }) => _id)
            : [ fieldValue._id ];
        }

        return [];
      });
    }
  };
};
