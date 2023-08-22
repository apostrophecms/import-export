const exportMethods = require('./export');

// TODO: remove:
const attachmentsMock = [ { foo: 'bar' } ];

module.exports = self => {
  return {
    async export(req, manager) {
      try {
        if (!req.user) {
          throw self.apos.error('forbidden');
        }

        const ids = self.apos.launder.ids(req.body._ids);
        const relatedTypes = self.apos.launder.strings(req.body.relatedTypes);
        const extension = self.apos.launder.string(req.body.extension, 'zip');

        // TODO: add batchSize?
        const expiration = typeof self.options.export === 'object' &&
          self.apos.launder.integer(self.options.export.expiration);

        if (!self.exportFormats[extension]) {
          throw self.apos.error('invalid');
        }

        const allIds = self.getAllModesIds(ids);

        if (!relatedTypes.length) {
          const docs = await self.fetchActualDocs(allIds);

          return self.exportDocs(req, docs, undefined, {
            extension,
            expiration
          });
        }

        console.log('==> RELATED TYPED ==>');

        const draftDocs = await self.getPopulatedDocs(req, manager, allIds, 'draft');
        const publishedDocs = await self.getPopulatedDocs(req, manager, allIds, 'published');

        // Get related docs id from BOTH the draft and published docs,
        // since they might have different related documents.
        const relatedIds = draftDocs
          .concat(publishedDocs)
          .flatMap(doc => self.getRelatedDocsIds(manager, doc, relatedTypes));

        const allRelatedIds = self.getAllModesIds(relatedIds);

        const docs = await self.fetchActualDocs([ ...allIds, ...allRelatedIds ]);

        return self.exportDocs(req, docs, undefined, {
          extension,
          expiration
        });
      } catch (error) {
        console.log(error);
      }
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
    fetchActualDocs(docsIds) {
      console.log('🚀 ~ file: methods.js:66 ~ fetchActualDocs ~ docsIds:', docsIds);

      // TODO: insert those in aposDocs.json, in a zip file
      // TODO: insert images and attachments in aposAttachment.json, in the same zip file
      return self.apos.doc.db
        .find({
          _id: {
            $in: [ ...new Set(docsIds) ]
          }
        })
        .toArray();
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

    getRelatedDocsIds(manager, doc, relatedTypes) {
      // Use `doc.type` for pages to get the actual schema of the corresponding page type.
      const schema = manager.schema || self.apos.modules[doc.type].schema;

      return self
        .getRelatedBySchema(doc, schema)
        .filter(relatedDoc => relatedTypes.includes(relatedDoc.type))
        .map(relatedDoc => relatedDoc._id);
    },

    // TODO: factorize with the one from AposI18nLocalize.vue
    // TODO: limit recursion to 10 as we do when retrieving related types?
    getRelatedBySchema(object, schema) {
      let related = [];
      for (const field of schema) {
        if (field.type === 'array') {
          for (const value of (object[field.name] || [])) {
            related = [
              ...related,
              ...self.getRelatedBySchema(value, field.schema)
            ];
          }
        } else if (field.type === 'object') {
          if (object[field.name]) {
            related = [
              ...related,
              ...self.getRelatedBySchema(object[field.name], field.schema)
            ];
          }
        } else if (field.type === 'area') {
          for (const widget of (object[field.name]?.items || [])) {
            related = [
              ...related,
              ...self.getRelatedBySchema(widget, self.apos.modules[`${widget?.type}-widget`]?.schema || [])
            ];
          }
        } else if (field.type === 'relationship') {
          related = [
            ...related,
            ...(object[field.name] || [])
          ];
          // Stop here, don't recurse through relationships or we're soon
          // related to the entire site
        }
      }
      // Filter out doc types that opt out completely (pages should
      // never be considered "related" to other pages simply because
      // of navigation links, the feature is meant for pieces that feel more like
      // part of the document being localized)
      return related.filter(doc => self.apos.modules[doc.type].relatedDocument !== false);
    },

    // TODO: use actual attachments when calling this method:
    exportDocs(req, docs, attachments = attachmentsMock, options) {
      console.log('export docs ==>');
      console.log(require('util').inspect(docs, { depth: 9, colors: true, showHidden: false }));

      const format = self.exportFormats[options.extension];

      // return self.exportRun(req, docs, attachments, docType, {
      //   ...options,
      //   format
      // });

      // TODO: fix reporting
      return self.apos.modules['@apostrophecms/job'].run(
        req,
        (req, reporting) => self.exportRun(req, reporting, docs, attachments, {
          ...options,
          format
        }),
        {}
      );
    },

    ...exportMethods(self)
  };
};
