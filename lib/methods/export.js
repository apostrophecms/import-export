const path = require('node:path');
const util = require('node:util');
const fsp = require('node:fs/promises');
const Promise = require('bluebird');
const dayjs = require('dayjs');
const { uniqBy } = require('lodash');

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
        return self.exportFile(
          req,
          reporting,
          format,
          { docs: cleanDocs },
          expiration
        );
      }

      const relatedDocs = docs.flatMap(doc =>
        self.getRelatedDocsFromSchema(req, {
          doc,
          schema: self.apos.modules[doc.type].schema,
          relatedTypes
        })
      );
      const allCleanDocs = [ ...self.clean(relatedDocs), ...cleanDocs ];

      if (!format.includeAttachments) {
        return self.exportFile(
          req,
          reporting,
          format,
          { docs: allCleanDocs },
          expiration
        );
      }

      const attachmentsIds = uniqBy([ ...docs, ...relatedDocs ], doc => doc._id)
        .flatMap(doc =>
          self.getRelatedDocsFromSchema(req, {
            doc,
            schema: self.apos.modules[doc.type].schema,
            type: 'attachment'
          })
        )
        .map(attachment => attachment._id);

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
          docs: allCleanDocs,
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
    },

    async exportFile(req, reporting, format, data, expiration) {
      const date = dayjs().format('YYYYMMDDHHmmss');
      const filename = `${self.apos.shortName}-${req.body.type.toLowerCase()}-export-${date}${format.extension}`;
      const filepath = path.join(self.apos.attachment.uploadfs.getTempPath(), filename);

      try {
        const result = await format.export(filepath, data, self.processAttachments);

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
          // Looking at the source code, the tar-stream module
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
      const remove = () => {
        console.info(`[export] removing ${self.apos.rootDir}/public/uploads${downloadPath} from uploadfs`);
        self.apos.attachment.uploadfs.remove(downloadPath, error => {
          if (error) {
            self.apos.util.error(error);
          }
        });
      };

      if (process.env.CI) {
        remove();
        return;
      }

      console.info(`[export] removing ${self.apos.rootDir}/public/uploads${downloadPath} from uploadfs in ${ms / 1000 / 60} minutes`);
      setTimeout(remove, ms);
    }
  };
};
