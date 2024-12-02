const path = require('node:path');
const util = require('node:util');
const fsp = require('node:fs/promises');
const Promise = require('bluebird');
const dayjs = require('dayjs');
const { uniqBy, uniqueId } = require('lodash');

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
        self.apos.launder.integer(self.options.importExport.export.expiration);

      const [ defaultFormatName ] = Object.keys(self.formats);
      const formatName = self.apos.launder.string(req.body.formatName, defaultFormatName);

      const format = self.formats[formatName];
      if (!format) {
        throw self.apos.error('invalid');
      }

      const hasRelatedTypes = !!relatedTypes.length;

      const docs = (await self.getDocs(req, ids, hasRelatedTypes, manager, reporting))
        .map((doc) => self.apos.util.clonePermanent(doc));
      if (!hasRelatedTypes) {
        return self.exportFile(
          req,
          reporting,
          format,
          { docs },
          expiration
        );
      }

      const allDocs = [ ...docs ];
      for (const doc of docs) {
        await self.getRelatedDocsFromSchema(req, {
          doc,
          schema: self.apos.modules[doc.type].schema,
          relatedTypes,
          storedData: allDocs
        });
      }

      if (!format.includeAttachments) {
        return self.exportFile(
          req,
          reporting,
          format,
          { docs: allDocs },
          expiration
        );
      }

      const attachmentsIds = [];
      for (const doc of allDocs) {
        await self.getRelatedDocsFromSchema(req, {
          doc,
          schema: self.apos.modules[doc.type].schema,
          type: 'attachment',
          storedData: attachmentsIds
        });
      }

      const attachments = await self.getAttachments(attachmentsIds);
      const cleanAttachments = self.clean(attachments);

      const attachmentUrls = Object.fromEntries(
        attachments.map(attachment => {
          const name = `${attachment._id}-${attachment.name}.${attachment.extension}`;
          return [ name, self.apos.attachment.url(attachment, {
            size: 'original',
            uploadfsPath: true
          }) ];
        })
      );

      return self.exportFile(
        req,
        reporting,
        format,
        {
          docs: allDocs,
          attachments: cleanAttachments,
          attachmentUrls
        },
        expiration
      );
    },

    // Get docs via their manager in order to populate them
    // so that we can retrieve their relationships IDs later,
    // and to let the manager handle permissions.
    async getDocs(req, docsIds, includeRelationships, manager, reporting) {
      if (!docsIds.length) {
        return [];
      }

      const { draftIds, publishedIds } = self.getAllModesIds(docsIds);
      const isReqDraft = req.mode === 'draft';

      const docs = [];

      const draftReq = isReqDraft ? req : req.clone({ mode: 'draft' });
      const draftDocs = await manager
        .findForEditing(draftReq, {
          _id: {
            $in: draftIds
          }
        })
        .relationships(includeRelationships)
        .toArray();

      docs.push(...draftDocs);

      const publishedReq = isReqDraft ? req.clone({ mode: 'published' }) : req;
      const publishedDocs = await manager
        .findForEditing(publishedReq, {
          _id: {
            $in: publishedIds
          }
        })
        .relationships(includeRelationships)
        .toArray();

      docs.push(...publishedDocs);

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
      return ids.reduce(({ draftIds, publishedIds }, id) => {
        return {
          draftIds: [ ...draftIds, id.replace('published', 'draft') ],
          publishedIds: [ ...publishedIds, id.replace('draft', 'published') ]
        };
      }, {
        draftIds: [],
        publishedIds: []
      });
    },

    // Filter our docs which module has the export option disabled
    // and clone them in order to get clean data for the export (no scalar data).
    clean(docs) {
      if (!docs.length) {
        return [];
      }

      return uniqBy(docs, doc => doc._id)
        .map(doc => self.apos.util.clonePermanent(doc));
    },

    getAttachments(ids) {
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

    canExport(req, docType) {
      return self.canImportOrExport(req, docType, 'export');
    },

    async getRelatedDocsFromSchema(req, {
      doc,
      schema,
      relatedTypes,
      storedData,
      type = 'relationship',
      recursion = 0,
      mode = doc.aposMode || req.mode
    }) {
      recursion++;
      if ((doc.type === '@apostrophecms/rich-text') && (type === 'relationship')) {
        await self.getRelatedDocsFromRichTextWidget(req, { doc, relatedTypes, storedData, recursion, mode });
      }
      for (const field of schema) {
        const fieldValue = doc[field.name];
        const shouldRecurse = recursion <= MAX_RECURSION;

        if (!field.withType && !fieldValue) {
          continue;
        }
        if (field.withType && relatedTypes && !relatedTypesIncludes(field.withType)) {
          continue;
        }
        if (field.withType && !self.canExport(req, field.withType)) {
          continue;
        }

        if (shouldRecurse && field.type === 'array') {
          for (const subField of fieldValue) {
            await self.getRelatedDocsFromSchema(req, {
              doc: subField,
              schema: field.schema,
              type,
              relatedTypes,
              recursion,
              storedData,
              mode
            });
          }
          continue;
        }

        if (shouldRecurse && field.type === 'object') {
          await self.getRelatedDocsFromSchema(req, {
            doc: fieldValue,
            schema: field.schema,
            type,
            relatedTypes,
            recursion,
            storedData,
            mode
          });
          continue;
        }

        if (shouldRecurse && field.type === 'area') {
          for (const widget of (fieldValue.items || [])) {
            const schema = self.apos.modules[`${widget?.type}-widget`]?.schema || [];
            await self.getRelatedDocsFromSchema(req, {
              doc: widget,
              schema,
              type,
              relatedTypes,
              recursion,
              storedData,
              mode
            });
          }
          continue;
        }

        if (field.type === type) {
          await self.handleRelatedField(req, {
            doc,
            field,
            fieldValue,
            relatedTypes,
            type,
            storedData,
            shouldRecurse,
            recursion,
            mode
          });
        }
      }

      function relatedTypesIncludes(name) {
        name = normalizeName(name);
        return relatedTypes.includes(name);
      }
    },

    async getRelatedDocsFromRichTextWidget(req, {
      doc,
      relatedTypes,
      storedData,
      recursion,
      mode
    }) {
      const linkedDocs = await self.apos.doc.db.find({
        aposDocId: {
          $in: doc.permalinkIds
        }
      }).project({
        type: 1,
        aposDocId: 1,
        slug: 1
      }).toArray();
      const linkedIdsByType = new Map();
      for (const linkedDoc of linkedDocs) {
        // Normalization is a little different here because these
        // are individual pages or pieces
        const name = linkedDoc.slug.startsWith('/') ? '@apostrophecms/any-page-type' : linkedDoc.type;
        const linkedIds = linkedIdsByType.get(name) || new Set();
        linkedIds.add(linkedDoc.aposDocId);
        if (linkedIds.size === 1) {
          linkedIdsByType.set(name, linkedIds);
        }
      }
      if (doc.imageIds?.length > 0) {
        linkedIdsByType.set('@apostrophecms/image', new Set(doc.imageIds));
      }
      const virtualDoc = {
        type: '@apostrophecms/rich-text_related'
      };
      const virtualSchema = [];
      for (const [ linkedType, linkedIds ] of linkedIdsByType.entries()) {
        const baseName = self.apos.util.slugify(linkedType);
        const fieldName = `_${baseName}`;
        const idsStorage = `${baseName}Ids`;
        virtualSchema.push({
          name: fieldName,
          type: 'relationship',
          withType: linkedType,
          idsStorage
        });
        const ids = [...linkedIds.values()];
        virtualDoc[idsStorage] = ids;
        virtualDoc[fieldName] = ids.map(id => ({ aposDocId: id }));
      }
      await self.getRelatedDocsFromSchema(req, {
        doc: virtualDoc,
        schema: virtualSchema,
        relatedTypes,
        storedData,
        type: 'relationship',
        recursion,
        mode
      });
    },

    async handleRelatedField(req, {
      doc,
      field,
      fieldValue,
      relatedTypes,
      type,
      storedData,
      shouldRecurse,
      recursion
    }) {
      if (type === 'attachment') {
        if (fieldValue && !storedData.includes(fieldValue._id)) {
          storedData.push(fieldValue._id);
        }
        return;
      }

      const manager = self.apos.doc.getManager(field.withType);
      const relatedIds = doc[field.idsStorage];
      if (!relatedIds?.length) {
        return;
      }
      const criteria = {
        aposDocId: { $in: relatedIds },
        $or: [
          { aposLocale: `${req.locale}:draft` },
          { aposLocale: `${req.locale}:published` },
          { aposLocale: null }
        ]
      };

      const foundRelated = await manager
        .findForEditing(req, criteria)
        .permission('view')
        .relationships(false)
        .areas(false)
        .locale(null)
        .toArray();

      for (const related of foundRelated) {
        const alreadyAdded = storedData.some(({ _id }) => _id === related._id);
        if (alreadyAdded) {
          continue;
        }

        storedData.push(self.apos.util.clonePermanent(related));
        if (!shouldRecurse) {
          continue;
        }

        const relatedManager = self.apos.doc.getManager(related.type);
        await self.getRelatedDocsFromSchema(req, {
          doc: related,
          schema: relatedManager.schema,
          type,
          relatedTypes,
          recursion,
          storedData
        });
      }
    },

    async exportFile(req, reporting, format, data, expiration) {
      const date = dayjs().format('YYYYMMDDHHmmss');
      const filename = `${self.apos.shortName}-${req.body.type.toLowerCase()}-export-${date}${format.extension}`;
      const filepath = path.join(self.apos.attachment.uploadfs.getTempPath(), filename);

      try {
        const result = await format.output(filepath, data, self.processAttachments);

        if (result?.attachmentError) {
          await self.apos.notify(req, 'aposImportExport:exportAttachmentError', {
            interpolate: { format: format.label },
            icon: 'alert-circle-icon',
            type: 'warning'
          });
        }
      } catch (error) {
        await self.apos.notify(req, 'aposImportExport:exportFileGenerationError', {
          interpolate: { format: format.label },
          icon: 'alert-circle-icon',
          type: 'danger'
        });
        throw self.apos.error(error.message);
      }

      // Must copy it to uploadfs, the server that created it
      // and the server that delivers it might be different
      const downloadPath = path.join('/exports', filename);
      const downloadUrl = `${self.apos.attachment.uploadfs.getUrl()}${downloadPath}`;
      const copyIn = util.promisify(self.apos.attachment.uploadfs.copyIn);
      console.info(`[export] copying ${filepath} to ${self.apos.rootDir}/public/uploads${downloadPath}`);
      try {
        await copyIn(filepath, downloadPath);
      } catch (error) {
        await self.remove(filepath);
        throw error;
      }

      if (reporting) {
        // Setting the download url which will automatically be
        // opened on the browser thanks to an event triggered
        // by a notification handled by the reporting.
        reporting.setResults({
          url: downloadUrl
        });
      } else {
        // No reporting means no batch operation:
        // We need to handle the notification manually
        // when exporting a single document:
        await self.apos.notification.trigger(req, 'aposImportExport:exported', {
          interpolate: {
            count: req.body._ids.length,
            type: req.body.type
          },
          dismiss: true,
          icon: 'database-export-icon',
          type: 'success',
          event: {
            name: 'import-export-export-download',
            data: {
              url: downloadUrl
            }
          }
        });
      }

      await self.remove(filepath);
      self.removeFromUploadFs(downloadPath, expiration);

      return { url: downloadUrl };
    },

    async processAttachments(attachments, addAttachment) {
      let attachmentError = false;

      const copyOut = Promise.promisify(self.apos.attachment.uploadfs.copyOut);

      await Promise.map(Object.entries(attachments), processAttachment, {
        concurrency: 5
      });

      return { attachmentError };

      async function processAttachment([ name, url ]) {
        const temp = self.apos.attachment.uploadfs.getTempPath() + '/' + self.apos.util.generateId();
        console.info(`[export] processing attachment ${name} temporarily stored in ${temp}`);
        try {
          await copyOut(url, temp);
          const { size } = await fsp.stat(temp);
          // Looking at the source code, the tar-stream module (when using the `gzip` format)
          // probably doesn't protect against two input streams
          // pushing mishmashed bytes into the tarball at the
          // same time, so stream in just one at a time. We still
          // get good concurrency on copyOut which is much slower
          // than this operation
          await self.apos.lock.withLock('import-export-copy-out', async () => {
            // Add attachment into the specific format
            await addAttachment(temp, name, size);
          });
        } catch (e) {
          attachmentError = true;
          self.apos.util.error(e);
        } finally {
          await self.remove(temp);
        }
      }
    },

    // Report is available for 10 minutes by default
    removeFromUploadFs(downloadPath, expiration) {
      const ms = expiration || 1000 * 60 * 10;
      const id = uniqueId();
      console.info(`[export] removing ${self.apos.rootDir}/public/uploads${downloadPath} from uploadfs in ${ms / 1000 / 60} minutes`);
      const handler = () => {
        console.info(`[export] removing ${self.apos.rootDir}/public/uploads${downloadPath} from uploadfs`);
        delete self.timeoutIds[id];
        return new Promise((resolve, _reject) => {
          self.apos.attachment.uploadfs.remove(downloadPath, error => {
            if (error) {
              self.apos.util.error(error);
            }
            resolve();
          });
        });
      };
      const timeoutId = setTimeout(handler, ms);
      self.timeoutIds[id] = {
        handler,
        timeoutId
      };
    },

    getRelatedTypes(req, schema = [], related = []) {
      findSchemaRelatedTypes(schema, related);
      return related;
      function findSchemaRelatedTypes(schema, related, recursions = 0) {
        recursions++;
        if (recursions >= MAX_RECURSION) {
          return;
        }
        for (const field of schema) {
          if (
            field.type === 'relationship' &&
            self.canExport(req, field.withType) &&
            !related.includes(field.withType)
          ) {
            pushRelated(related, field.withType);
            const relatedManager = self.apos.doc.getManager(field.withType);
            findSchemaRelatedTypes(relatedManager.schema, related, recursions);
          } else if ([ 'array', 'object' ].includes(field.type)) {
            findSchemaRelatedTypes(field.schema, related, recursions);
          } else if (field.type === 'area') {
            const widgets = self.apos.area.getWidgets(field.options);
            for (const [ widget, options ] of Object.entries(widgets)) {
              const schema = self.apos.area.getWidgetManager(widget).schema;
              if (widget === '@apostrophecms/rich-text') {
                self.getRelatedTypesFromRichTextWidget(req, { options, related });
              }
              findSchemaRelatedTypes(schema, related, recursions);
            }
          }
        }
      }
    },
    // Does not currently utilize req, but it could be relevant in overrides and is
    // always the first argument by convention, so it is included in the signature
    getRelatedTypesFromRichTextWidget(req, {
      options,
      related
    }) {
      const manager = self.apos.modules['@apostrophecms/rich-text-widget'];
      const rteOptions = {
        ...manager.options.defaultOptions,
        ...options
      };
      if ((rteOptions.toolbar?.includes('image') || rteOptions.insert?.includes('image')) && !related.includes('@apostrophecms/image')) {
        pushRelated(related, '@apostrophecms/image');
      }
      if (rteOptions.toolbar?.includes('link')) {
        for (const name of manager.linkFields.linkTo.choices.map(choice => choice.value)) {
          if (self.apos.doc.getManager(name) && !related.includes(name)) {
            pushRelated(related, name);
          }
        }
      }
    }
  };
};

function normalizeName(name) {
  if (name === '@apostrophecms/page') {
    return '@apostrophecms/any-page-type';
  } else {
    return name;
  }
}

function pushRelated(related, name) {
  name = normalizeName(name);
  if (!related.includes(name)) {
    related.push(name);
  }
}
