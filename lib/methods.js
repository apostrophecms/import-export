module.exports = self => {
  return {
    async export(req, manager) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      const docIds = self.apos.launder.ids(req.query._ids);
      const relatedTypes = self.apos.launder.strings(req.query.relatedTypes);

      console.log('docIds', docIds);
      console.log('relatedTypes', relatedTypes);

      const criteria = {
        aposLocale: {
          $in: [
            `${req.locale}:draft`,
            `${req.locale}:published`
          ]
        },
        aposDocId: {
          $in: docIds.map(self.apos.doc.toAposDocId)
        }
      };

      console.log(req.mode);
      console.log(req.mode);
      console.log(req.mode);
      console.log(req.mode);

      // Get docs via their manager in order to load their relationships
      // so that we can retrieve their ids.
      const docs = await manager
        .find(req, criteria)
        .toArray();
      const docsIds = docs.map(doc => doc._id);

      console.log('docs', docs);
      console.log('docsIds', docsIds);

      if (!relatedTypes.length) {
        return self.fetchActualDocs(docsIds);
      }

      console.log('RELATED TYPED ==>');

      const relatedIds = docs.flatMap(doc => {
        // Use `doc.type` for pages to get the actual schema of the corresponding page type.
        const schema = manager.schema || self.apos.modules[doc.type].schema;

        return self
          .getRelatedBySchema(doc, schema)
          .filter(relatedDoc => relatedTypes.includes(relatedDoc.type))
          .map(relatedDoc => relatedDoc._id)
          .filter(Boolean);
      });

      console.log('relatedIds', relatedIds);

      const allIds = [
        ...docIds,
        ...relatedIds
      ];

      const ids = [ ...new Set(allIds) ];

      return self.fetchActualDocs(ids);
    },

    // TODO: re-retrieve docs from db directly, without via the manager to get the exact data from the db?
    async fetchActualDocs(ids) {
      console.log('🚀 ~ file: methods.js:66 ~ fetchActualDocs ~ ids:', ids);

      return ids;
    },

    // TODO: factorize with the one from AposI18nLocalize.vue
    getRelatedBySchema(object, schema, relatedTypesToInclude = []) {
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
    }
  };
};
