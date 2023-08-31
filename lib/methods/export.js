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
      const expiration = self.options.importExport?.export?.expiration &&
        self.apos.launder.integer(self.options.export.expiration);

      const format = self.exportFormats[extension];
      if (!format) {
        throw self.apos.error('invalid');
      }

      if (!relatedTypes.length) {
        // No related docs, we simply fetch the docs with the provided ids
        const docs = await self.getDocs(req, manager, ids);
        console.log('🚀 ~ file: export.js:28 ~ export ~ docs:', docs);
        const docsIds = docs.map(doc => doc._id);
        console.log('🚀 ~ file: export.js:29 ~ export ~ docsIds:', docsIds);

        const rawDocs = await self.getRawDocs(req, docsIds, reporting);
        console.log('🚀 ~ file: export.js:33 ~ export ~ rawDocs:', rawDocs);

        return self.createArchive(
          req,
          reporting,
          self.formatArchiveData(rawDocs),
          {
            extension,
            expiration,
            format
          }
        );
      }

      // With related docs, we need the docs relationships populated
      const docs = await self.getDocs(req, manager, ids, true);
      const docsIds = docs.map(doc => doc._id);

      const related = docs.flatMap(doc =>
        self.getRelatedBySchema(req, {
          doc,
          schema: self.apos.modules[doc.type].schema,
          relatedTypes
        })
      );
      console.log('related', related);

      // Regroup ids by their type,
      // eg: `{ topic: [ 'id1', 'id2', 'id3' ], article: [ 'id4', 'id5' ] }`
      // in order to fetch them via their manager all together:
      const relatedIdsByType = related.reduce((object, related) => {
        if (!object[related.type]) {
          return {
            ...object,
            [related.type]: [ related._id ]
          };
        }
        object[related.type].push(related._id);
        return object;
      }, {});
      console.log('relatedIdsByType', relatedIdsByType);

      const getRelatedDocsPromises = Object
        .entries(relatedIdsByType)
        .map(([ type, relatedIds ]) => {
          console.log('type', type);
          console.log('relatedIds', relatedIds);
          const manager = self.apos.doc.getManager(type);
          if (!manager) {
            return Promise.reject(new Error(`Cannot find the manager for type: ${type}`));
          }
          return self.getDocs(req, manager, relatedIds);
        });
      console.log('🚀 ~ file: export.js:84 ~ export ~ getRelatedDocsPromises:', getRelatedDocsPromises);

      const relatedDocsByType = await Promise.all(getRelatedDocsPromises);
      console.log('🚀 ~ file: export.js:87 ~ export ~ relatedDocs:', relatedDocsByType);
      const relatedDocsIds = relatedDocsByType.flatMap(
        relatedDocByType => relatedDocByType.map(relatedDoc => relatedDoc._id)
      );
      console.log('🚀 ~ file: export.js:87 ~ export ~ relatedDocsIds:', relatedDocsIds);

      const rawDocs = await self.getRawDocs(req, [ ...docsIds, ...relatedDocsIds ], reporting);

      const attachmentsIds = rawDocs
        .flatMap(doc =>
          self.getRelatedBySchema(req, {
            doc,
            schema: self.apos.modules[doc.type].schema,
            type: 'attachment'
          })
        )
        .map(attachment => attachment._id);

      const rawAttachments = await self.getRawDocs(req, attachmentsIds, reporting, 'attachment');

      const attachmentUrls = Object.fromEntries(
        rawAttachments.map((attachment) => {
          const name = `${attachment._id}-${attachment.name}.${attachment.extension}`;
          return [ name, self.apos.attachment.url(attachment, { size: 'original' }) ];
        })
      );

      return self.createArchive(
        req,
        reporting,
        self.formatArchiveData(rawDocs, rawAttachments, attachmentUrls),
        {
          extension,
          expiration,
          format
        }
      );
    },

    // Get docs via their manager in order to populate them
    // so that we can retrieve their relationships IDs later.
    async getDocs(req, manager, docsIds, fullDocs) {
      const draftAndPublishedIds = self.getAllModesIds(docsIds);
      const projection = fullDocs
        ? {}
        : { _id: 1 };

      const draftDocs = await manager
        .find(req.clone({ mode: 'draft' }), {
          _id: {
            $in: draftAndPublishedIds
          }
        })
        .project(projection)
        // .permission('view-draft') // TODO: add this?
        .toArray();

      const publishedDocs = await manager
        .find(req.clone({ mode: 'published' }), {
          _id: {
            $in: draftAndPublishedIds
          }
        })
        .project(projection)
        // .permission('view-draft') // TODO: add this?
        .toArray();

      return [ ...draftDocs, ...publishedDocs ];
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
    async getRawDocs(req, docsIds, reporting, collection = 'doc') {
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

      return docs.filter(doc => self.canExport(doc.type));
    },

    canImport(docType) {
      return self.canImportOrExport(docType, 'import');
    },

    canExport(docType) {
      return self.canImportOrExport(docType, 'export');
    },

    // Filter our docs that have their module with the import or export option set to false
    // and docs that have "admin only" permissions when the user is not an admin.
    // If a user does not have at lease the permission to view the draft, he won't
    // be able to import or export it.
    canImportOrExport(docType, action) {
      const docModule = self.apos.modules[docType];
      if (!docModule) {
        return false;
      }

      if (docModule.options.importExport?.[action] === false) {
        return false;
      }

      return true;
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

    getRelatedBySchema(req, {
      doc, schema, type = 'relationship', relatedTypes, recursion = 0
    }) {
      return schema.flatMap(field => {
        const fieldValue = doc[field.name];
        const shouldRecurse = recursion <= MAX_RECURSION;

        if (!fieldValue) {
          return [];
        }
        if (field.withType && relatedTypes && !relatedTypes.includes(field.withType)) {
          return [];
        }
        if (field.withType && !self.canExport(field.withType)) {
          return [];
        }

        if (shouldRecurse && field.type === 'array') {
          return fieldValue.flatMap((subField) => self.getRelatedBySchema(req, {
            doc: subField,
            schema: field.schema,
            type,
            relatedTypes,
            recursion: recursion + 1
          }));
        }

        if (shouldRecurse && field.type === 'object') {
          return self.getRelatedBySchema(req, {
            doc: fieldValue,
            schema: field.schema,
            type,
            relatedTypes,
            recursion: recursion + 1
          });
        }

        if (shouldRecurse && field.type === 'area') {
          return (fieldValue.items || []).flatMap((widget) => self.getRelatedBySchema(req, {
            doc: widget,
            schema: self.apos.modules[`${widget?.type}-widget`]?.schema || [],
            type,
            relatedTypes,
            recursion: recursion + 1
          }));
        }

        if (field.type === type) {
          console.log('fieldValue', fieldValue);
          return Array.isArray(fieldValue)
            ? fieldValue.map(({ _id, type }) => ({
              _id,
              type
            }))
            : [ {
              _id: fieldValue._id,
              type: fieldValue.type
            } ];
        }

        return [];
      });
    }
  };
};
