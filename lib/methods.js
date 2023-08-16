module.exports = self => {
  return {
    async export(req, manager) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      const docsIds = self.apos.launder.ids(req.query._ids);
      const relatedTypes = self.apos.launder.strings(req.query.relatedTypes);

      if (!relatedTypes.length) {
        return self.fetchActualDocs(docsIds);
      }

      console.log('==> RELATED TYPED ==>');

      const populatedDocs = await self.getPopulatedDocs(req, manager, docsIds);
      console.log('populatedDocs', populatedDocs);

      const relatedIds = populatedDocs.flatMap(
        populatedDoc => self.getRelatedDocsIds(manager, populatedDoc, relatedTypes)
      );
      console.log('relatedIds', relatedIds);

      return self.fetchActualDocs([ ...docsIds, ...relatedIds ]);
    },

    // Fetch the documents exactly as they are in the database,
    // without altering the fields or populating them, as the managers would.
    fetchActualDocs(draftIds) {
      console.log('🚀 ~ file: methods.js:66 ~ fetchActualDocs ~ draftIds:', draftIds);

      // Add the published version ID next to each draft ID,
      // it's ok if it does not exist in the database.
      const allModesIds = draftIds.flatMap(draftId => [
        draftId,
        draftId.replace(':draft', ':published')
      ]);

      console.log('allModesIds', allModesIds);

      const allModesIdsUniq = [ ...new Set(allModesIds) ];
      console.log('allModesIdsUniq', allModesIdsUniq);

      return self.apos.doc.db
        .find({
          _id: {
            $in: allModesIdsUniq
          }
        })
        .toArray();
    },

    // Get docs via their manager in order to populate them
    // so that we can retrieve their relationships IDs later.
    getPopulatedDocs(req, manager, docsIds) {
      return manager
        .find(req.clone({ mode: 'draft' }), {
          _id: {
            // TODO: ensure that ids are always sent as "draft"
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
    }
  };
};
