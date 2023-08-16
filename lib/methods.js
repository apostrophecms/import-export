module.exports = self => {
  return {
    async export(req, docIds, relatedTypes) {
      console.log('docIds', docIds);
      console.log('relatedTypes', relatedTypes);

      // const docc = await self.apos.modules.article.find(req, { _id: 'cllc4bjfn002ufd1ud0e91n9i:en:published' }).toObject();
      // console.log('🚀 ~ file: methods.js:8 ~ export ~ docc:', docc);
      // console.log(require('util').inspect(self.getRelatedBySchema(docc, self.apos.modules.article.schema, relatedTypes), { depth: 9, colors: true, showHidden: false }));
      // return;
      const docs = await self.apos.doc.db
        .find({
          aposLocale: {
            $in: [
              `${req.locale}:draft`,
              `${req.locale}:published`
            ]
          },
          aposDocId: {
            $in: docIds.map(self.apos.doc.toAposDocId)
          }
        })
        .toArray();

      console.log('docs', docs);

      if (!relatedTypes.length) {
        return docs;
      }

      for (const doc of docs) {
        const manager = self.apos.doc.getManager(doc.type);

        if (!manager || !manager.schema) {
          continue;
        }

        const relatedDocs = self.getRelatedBySchema(doc, manager.schema, relatedTypes);

        console.log('related docs');
        console.log(require('util').inspect(relatedDocs, { depth: 9, colors: true, showHidden: false }));

        if (!relatedDocs.length) {
          continue;
        }

        const relatedDocsId = docs.map(doc => doc._id);

        // await self.apos.schema.relate(req, manager.schema, doc, relatedTypes);
        console.log(require('util').inspect(relatedDocsId, { depth: 9, colors: true, showHidden: false }));
      }

      // TODO: remove duplicated docs

      return 'temporary result';
    },

    // TODO: factorize with the one from AposI18nLocalize.vue
    getRelatedBySchema(object, schema, relatedTypes) {
      console.log('🚀 ~ file: methods.js:54 ~ getRelatedBySchema ~ schema:', schema);
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
          console.log('field', field);
          console.log('object', object);
          related = [
            ...related,
            ...(object[field.name] || [])
          ];
          // Stop here, don't recurse through relationships or we're soon
          // related to the entire site
        }
      }
      console.log('related', related);
      // Filter out doc types that opt out completely (pages should
      // never be considered "related" to other pages simply because
      // of navigation links, the feature is meant for pieces that feel more like
      // part of the document being localized)
      return related.filter(doc => self.apos.modules[doc.type].relatedDocument !== false);
    }
  };
};
