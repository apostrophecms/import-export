const fsp = require('node:fs/promises');
const { cloneDeep } = require('lodash');

module.exports = self => {
  return {
    async import(req, moduleName) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      const { file } = req.files || {};
      const overrideLocale = self.apos.launder.boolean(req.body.overrideLocale);
      const formatLabel = self.apos.launder.string(req.body.formatLabel);
      let exportPath = await self.getExportPathById(self.apos.launder.string(req.body.exportPathId));
      let format;
      let docs;
      let attachmentsInfo;

      try {
        if (overrideLocale) {
          if (!formatLabel) {
            throw self.apos.error('invalid: no `formatLabel` provided');
          }
          if (!exportPath) {
            throw self.apos.error('invalid: no `exportPath` provided');
          }

          format = Object
            .values(self.formats)
            .find(format => format.label === formatLabel);

          ({ docs, attachmentsInfo = [] } = await format.import(exportPath));
        } else {
          if (!file) {
            throw new Error('invalid: no file provided');
          }

          format = Object
            .values(self.formats)
            .find(format => format.allowedTypes.includes(file.type));

          ({
            docs,
            attachmentsInfo = [],
            exportPath = file.path
          } = await format.import(file.path));

          await self.setExportPathId(exportPath);
        }
      } catch (error) {
        await self.apos.notify(req, 'aposImportExport:importFileError', {
          interpolate: { format: format.label },
          dismiss: true,
          icon: 'alert-circle-icon',
          type: 'danger'
        });
        throw self.apos.error(error.message);
      }

      const differentDocsLocale = self.getFirstDifferentLocale(req, docs);
      const siteHasMultipleLocales = Object.keys(self.apos.i18n.locales).length > 1;

      if (differentDocsLocale) {
        if (siteHasMultipleLocales && !overrideLocale) {
          // Display confirmation modal to ask the user if he wants to
          // continue the import with the current locale overriding the docs one:
          await self.apos.notify(req, ' ', {
            type: 'warning',
            event: {
              name: 'import-export-import-locale-differs',
              data: {
                moduleName,
                exportPathId: await self.getExportPathId(exportPath),
                formatLabel: format.label,
                content: {
                  heading: req.t('aposImportExport:importWithCurrentLocaleHeading'),
                  description: req.t('aposImportExport:importWithCurrentLocaleDescription', {
                    docsLocale: differentDocsLocale,
                    currentLocale: req.locale
                  }),
                  negativeLabel: 'apostrophe:no',
                  affirmativeLabel: 'apostrophe:yes'
                }
              }
            },
            classes: [ 'apos-notification--hidden' ]
          });

          return;
        }

        // Re-write if user decided to continue the import (`overrideLocale` param sent)
        // or if the site has only one locale configured
        self.rewriteDocsWithCurrentLocale(req, docs);
      }

      const total = docs.length + attachmentsInfo.length;

      const {
        reporting, jobId, notificationId
      } = await self.instantiateJob(req, total);

      const {
        duplicatedDocs, duplicatedIds, failedIds
      } = await self.insertDocs(req, docs, reporting);

      const importedAttachments = await self.insertAttachments(req, {
        attachmentsInfo,
        reporting,
        duplicatedIds,
        docIds: new Set(docs.map(({ aposDocId }) => aposDocId))
      });

      if (!duplicatedDocs.length) {
        await reporting.end();

        const notifMsg = `aposImportExport:${failedIds.length ? 'importFailedForSome' : 'importSucceed'}`;

        await self.apos.notify(req, notifMsg, {
          interpolate: {
            count: failedIds.length
          },
          dismiss: true,
          icon: 'database-import-icon',
          type: failedIds.length ? 'danger' : 'success',
          event: {
            name: 'import-export-import-ended'
          }
        });

        self.apos.notification
          .dismiss(req, notificationId, 2000)
          .catch(self.apos.util.error);

        await self.removeExport(exportPath);
        return;
      }

      if (failedIds.length) {
        await self.apos.notify(req, 'aposImportExport:importFailedForSome', {
          interpolate: {
            count: failedIds.length
          },
          dismiss: true,
          icon: 'database-import-icon',
          type: 'danger'
        });
      }

      const results = {
        overrideLocale,
        duplicatedDocs,
        importedAttachments,
        type: moduleName,
        exportPathId: await self.getExportPathId(exportPath),
        jobId,
        notificationId,
        formatLabel: format.label
      };

      // we only care about the event here,
      // to display the duplicated docs modal
      await self.apos.notify(req, ' ', {
        type: 'warning',
        event: {
          name: 'import-export-import-duplicates',
          data: results
        },
        classes: [ 'apos-notification--hidden' ]
      });

      return results;
    },

    async instantiateJob(req, total) {
      const jobManager = self.apos.modules['@apostrophecms/job'];
      const job = await jobManager.start();

      const { noteId } = await self.apos.notify(req, 'aposImportExport:importing', {
        icon: 'database-import-icon',
        type: 'success',
        job: {
          _id: job._id
        },
        return: true
      });

      await jobManager.setTotal(job, total);

      return {
        reporting: {
          success(n) {
            return jobManager.success(job, n);
          },
          failure(n) {
            return jobManager.failure(job, n);
          },
          end(success = true) {
            return jobManager.end(job, success);
          }
        },
        jobId: job._id,
        notificationId: noteId
      };
    },

    getFirstDifferentLocale(req, docs) {
      const doc = docs
        .find(doc => self.isLocaleDifferent(req, doc));

      return doc && self.extractLocale(doc.aposLocale);
    },

    rewriteDocsWithCurrentLocale(req, docs) {
      for (const doc of docs) {
        if (self.isLocaleDifferent(req, doc)) {
          const [ id ] = doc._id.split(':');

          doc._id = [ id, req.locale, doc.aposMode ].join(':');
          doc.aposLocale = [ req.locale, doc.aposMode ].join(':');
        }
      }
    },

    isLocaleDifferent(req, doc) {
      return doc.aposLocale && self.extractLocale(doc.aposLocale) !== req.locale;
    },

    extractLocale(aposLocale) {
      const [ locale ] = aposLocale.split(':');

      return locale;
    },

    // TODO: duplicatedDocs are not detected when importing as published only
    async insertDocs(req, docs, reporting) {
      const duplicatedDocs = [];
      const duplicatedIds = [];
      const failedIds = [];

      for (const doc of docs) {
        const cloned = cloneDeep(doc);

        try {
          const inserted = await self.insertOrUpdateDoc(req, {
            doc,
            duplicatedIds,
            failedIds
          });
          if (inserted) {
            reporting.success();
          }
        } catch (error) {
          if (!self.apos.doc.isUniqueError(error)) {
            reporting.failure();
            failedIds.push(cloned.aposDocId);
            self.apos.util.error(error);
            continue;
          }

          const isSingleton = self.apos.modules[cloned.type] &&
              self.apos.modules[cloned.type].options.singleton === true;

          if (isSingleton) {
            try {
              await self.insertOrUpdateDoc(req, {
                doc: cloned,
                method: 'update',
                duplicatedIds,
                failedIds
              });
              reporting.success();
            } catch (err) {
              reporting.failure();
              failedIds.push(cloned.aposDocId);
            }
          } else if (cloned.aposMode === 'draft') {
            duplicatedDocs.push({
              aposDocId: cloned.aposDocId,
              title: cloned.title,
              type: cloned.type,
              updatedAt: cloned.updatedAt
            });
            duplicatedIds.push(cloned.aposDocId);
          }
        }
      }

      return {
        duplicatedDocs,
        duplicatedIds,
        failedIds
      };
    },

    async insertAttachments(req, {
      attachmentsInfo, reporting, duplicatedIds, docIds
    }) {
      const importedAttachments = [];

      for (const attachmentInfo of attachmentsInfo) {
        try {
          await self.insertOrUpdateAttachment(req, {
            attachmentInfo,
            duplicatedIds,
            docIds
          });
          importedAttachments.push(attachmentInfo.attachment._id);
          reporting.success();
        } catch (err) {
          self.apos.util.error(err);
        }
      }

      return importedAttachments;
    },

    // TODO: Should we stop the published version from being imported if the draft failed?
    async insertOrUpdateDoc(req, {
      doc, method = 'insert', duplicatedIds, failedIds
    }) {
      const isPage = self.apos.page.isPage(doc);
      const manager = isPage
        ? self.apos.page
        : self.apos.modules[doc.type];

      if (!manager) {
        throw new Error(`No manager found for this module: ${doc.type}`);
      }

      // Import can be disable at the page-type level
      if (!self.canImport(req, doc.type)) {
        throw new Error(`Import is disabled for this module: ${doc.type}`);
      }

      if (doc.aposMode === 'published') {
        if (failedIds && failedIds.includes(doc.aposDocId)) {
          throw new Error('Inserting document failed');
        }

        if (duplicatedIds && duplicatedIds.includes(doc.aposDocId)) {
          return false;
        }

        if (manager.options.autopublish === true) {
          return true;
        }
      }

      if (method === 'update' && doc.aposMode === 'draft') {
        const existingDoc = await self.apos.doc.db.findOne({ _id: doc._id }, {
          lastPublishedAt: 1
        });
        if (existingDoc) {
          doc.lastPublishedAt = existingDoc.lastPublishedAt;
        }
      }

      const _req = req.clone({ mode: doc.aposMode });

      if (isPage) {
        return method === 'update'
          ? manager[method](_req, doc, { setModified: false })
          : manager[method](_req, '_home', 'lastChild', doc, { setModified: false });
      }

      return manager[method](_req, doc, { setModified: false });
    },

    canImport(req, docType) {
      return self.canImportOrExport(req, docType, 'import');
    },

    async insertOrUpdateAttachment(req, {
      attachmentInfo: { attachment, file }, duplicatedIds, docIds
    }) {
      // TODO: Find a more efficient way to compare only relatedIds
      // (we need to find a way to keep autopublish published IDs in that case)
      if (duplicatedIds && docIds) {
        const relatedIds = attachment.docIds
          .reduce((acc, id) => {
            const aposId = id.replace(/:.+$/, '');
            return [
              ...acc,
              ...acc.includes(aposId) || !docIds.has(aposId) ? [] : [ aposId ]
            ];
          }, []);

        if (duplicatedIds && relatedIds.every((id) => duplicatedIds.includes(id))) {
          throw self.apos.error(`Related documents have not been imported for attachment: ${attachment._id}`);
        }
      }

      try {
        await self.apos.attachment.insert(
          req,
          file,
          { attachmentId: attachment._id }
        );
      } catch (err) {
        if (err.message === 'duplicate') {
          await self.apos.attachment.update(
            req,
            file,
            attachment
          );
        } else {
          throw err;
        }
      }
    },

    async overrideDuplicates(req) {
      const overrideLocale = self.apos.launder.boolean(req.body.overrideLocale);
      const exportPath = await self.getExportPathById(self.apos.launder.string(req.body.exportPathId));
      const docIds = self.apos.launder.strings(req.body.docIds);
      const jobId = self.apos.launder.string(req.body.jobId);
      const importedAttachments = self.apos.launder.strings(req.body.importedAttachments);
      const formatLabel = self.apos.launder.string(req.body.formatLabel);
      const failedIds = [];

      const jobManager = self.apos.modules['@apostrophecms/job'];
      const job = await jobManager.db.findOne({ _id: jobId });

      const format = Object
        .values(self.formats)
        .find(format => format.label === formatLabel);

      if (!format) {
        jobManager.failure(job);
        throw self.apos.error(`invalid format "${formatLabel}"`);
      }

      const { docs, attachmentsInfo = [] } = await format.import(exportPath);

      const filterDocs = docs.filter(doc => docIds.includes(doc.aposDocId));

      const differentDocsLocale = self.getFirstDifferentLocale(req, filterDocs);
      const siteHasMultipleLocales = Object.keys(self.apos.i18n.locales).length > 1;

      // Re-write locale if `overrideLocale` param is passed-on from the import process
      // (i.e if the user chose "Yes")
      // or re-write locale automatically on a single-locale site
      if (differentDocsLocale && (!siteHasMultipleLocales || overrideLocale)) {
        self.rewriteDocsWithCurrentLocale(req, filterDocs);
      }

      for (const doc of filterDocs) {
        try {
          await self.insertOrUpdateDoc(req, {
            doc,
            method: 'update',
            failedIds
          });

          jobManager.success(job);

          if (attachmentsInfo.length) {
            const attachmentsToOverride = self.getRelatedDocsFromSchema(req, {
              doc,
              schema: self.apos.modules[doc.type].schema,
              type: 'attachment'
            });

            for (const { _id } of attachmentsToOverride) {
              if (importedAttachments.includes(_id)) {
                continue;
              }
              const attachmentInfo = attachmentsInfo
                .find(({ attachment }) => attachment._id === _id);

              try {
                await self.insertOrUpdateAttachment(req, { attachmentInfo });
                jobManager.success(job);
                importedAttachments.push(_id);
              } catch (err) {
                jobManager.failure(job);
              }
            }
          }
        } catch (err) {
          jobManager.failure(job);
          failedIds.push(doc.aposDocId);
          self.apos.util.error(err);
          continue;
        }
      }

      if (failedIds.length) {
        await self.apos.notify(req, 'aposImportExport:importFailedForSome', {
          interpolate: {
            count: failedIds.length
          },
          dismiss: true,
          icon: 'database-import-icon',
          type: 'danger'
        });
      }
    },

    async setExportPathId(path) {
      const id = self.apos.util.generateId();
      await self.apos.cache.set('exportPaths', id, path, 86400);
      await self.apos.cache.set('exportPathIds', path, id, 86400);
      return id;
    },

    async getExportPathById(id) {
      return self.apos.cache.get('exportPaths', id);
    },

    async getExportPathId(path) {
      return self.apos.cache.get('exportPathIds', path);
    },

    async cleanExport(req) {
      console.info('[import] cleaning export...');
      const exportPath = await self.getExportPathById(self.apos.launder.string(req.body.exportPathId));
      if (!exportPath) {
        throw self.apos.error.invalid('no such export path');
      }
      const jobId = self.apos.launder.string(req.body.jobId);
      const notificationId = self.apos.launder.string(req.body.notificationId);

      if (jobId) {
        const jobManager = self.apos.modules['@apostrophecms/job'];
        const job = await jobManager.db.findOne({ _id: jobId });
        jobManager.end(job, true);
      }
      if (notificationId) {
        self.apos.notification.dismiss(req, notificationId, 2000).catch(self.apos.util.error);
      }

      await self.removeExport(exportPath);
    },

    async removeExport(filepath) {
      try {
        const stat = await fsp.lstat(filepath);
        if (stat.isDirectory()) {
          await fsp.rm(filepath, {
            recursive: true,
            force: true
          });
        } else {
          await fsp.unlink(filepath);
        }
        console.info(`[import] export path ${filepath} has been removed`);
      } catch (err) {
        console.trace();
        self.apos.util.error(
          `Error while trying to remove the file or folder: ${filepath}. You might want to remove it yourself.`
        );
      }
    }
  };
};
