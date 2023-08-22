module.exports = self => {
  return {
    async export(req, manager) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      const ids = self.apos.launder.ids(req.query._ids);
      const relatedTypes = self.apos.launder.strings(req.query.relatedTypes);

      const allIds = self.getAllModesIds(ids);

      if (!relatedTypes.length) {
        return self.fetchActualDocs(allIds);
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
      const docs = await self.fetchActualDocs([ ...allIds, ...allRelatedIds ]);

      const attachmentsIds = docs.flatMap(doc => {
        return self.getRelatedIdsBySchema({
          doc,
          schema: self.apos.modules[doc.type].schema,
          type: 'attachment'
        });
      });
      const attachments = await self.fetchActualDocs(attachmentsIds, 'attachment');
      const attachmentUrls = attachments.map((attachment) => {
        const name = `${attachment._id}-${attachment.name}.${attachment.extension}`;
        return {
          [name]: self.apos.attachment.url(attachment, { size: 'original' })
        };
      });

      await self.generateZipFile({
        docs,
        attachments,
        attachmentUrls
      });

      return {
        docs,
        attachments,
        attachmentUrls
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
    fetchActualDocs(docsIds, docType = 'doc') {
      /* console.log('🚀 ~ file: methods.js:66 ~ fetchActualDocs ~ docsIds:', docsIds); */

      // TODO: insert those in aposDocs.json, in a zip file
      // TODO: insert images and attachments in aposAttachment.json, in the same zip file
      return self.apos[docType].db
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

    getRelatedIdsBySchema({
      doc, schema, type = 'relationship', relatedTypes
    }) {
      return schema.flatMap(field => {
        const fieldValue = doc[field.name];

        if (
          !fieldValue ||
          (relatedTypes && fieldValue.type && !relatedTypes.includes(fieldValue.type)) ||
          (
            type === 'relationship' &&
            fieldValue.type &&
            self.apos.modules[fieldValue.type].relatedDocument === false
          )
        ) {
          return [];
        }

        if (field.type === 'array') {
          return fieldValue.flatMap((subField) => self.getRelatedIdsBySchema({
            doc: subField,
            schema: field.schema,
            type
          }));
        }

        if (field.type === 'object') {
          return self.getRelatedIdsBySchema({
            doc: fieldValue,
            schema: field.schema,
            type
          });
        }

        if (field.type === 'area') {
          return (fieldValue.items || []).flatMap((widget) => self.getRelatedIdsBySchema({
            doc: widget,
            schema: self.apos.modules[`${widget?.type}-widget`]?.schema || [],
            type
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

// TODO: factorize with the one from AposI18nLocalize.vue
// TODO: limit recursion to 10 as we do when retrieving related types?
/* getRelatedBySchema(object, schema, type = 'relationship') { */
/*   let related = []; */
/*   for (const field of schema) { */
/*     if (field.type === 'array') { */
/*       for (const value of (object[field.name] || [])) { */
/*         related = [ */
/*           ...related, */
/*           ...self.getRelatedBySchema(value, field.schema, type) */
/*         ]; */
/*       } */
/*     } else if (field.type === 'object') { */
/*       if (object[field.name]) { */
/*         related = [ */
/*           ...related, */
/*           ...self.getRelatedBySchema(object[field.name], field.schema, type) */
/*         ]; */
/*       } */
/*     } else if (field.type === 'area') { */
/*       for (const widget of (object[field.name]?.items || [])) { */
/*         related = [ */
/*           ...related, */
/*           ...self.getRelatedBySchema(widget, self.apos.modules[`${widget?.type}-widget`]?.schema || [], type) */
/*         ]; */
/*       } */
/*     } else if (field.type === type) { */
/*       const item = object[field.name]; */
/*       if (item) { */
/*         related = [ */
/*           ...related, */
/*           ...Array.isArray(item) ? item : [ item ] */
/*         ]; */
/*       } */
/*       // Stop here, don't recurse through relationships or we're soon */
/*       // related to the entire site */
/*     } */
/*   } */
/**/
/*   // Filter out doc types that opt out completely (pages should */
/*   // never be considered "related" to other pages simply because */
/*   // of navigation links, the feature is meant for pieces that feel more like */
/*   // part of the document being localized) */
/*   return related.filter(doc => !self.apos.modules[doc.type] || */
/*     self.apos.modules[doc.type].relatedDocument !== false); */
/* }, */
