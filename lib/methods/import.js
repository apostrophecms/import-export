const path = require('path');
const fsp = require('node:fs/promises');
const { cloneDeep } = require('lodash');
const { EJSON } = require('bson');

module.exports = self => {
  return {
    async import(req,
      /* reporting, */
      {
        docs,
        attachmentsInfo,
        exportPath,
        filePath
      }) {

      const {
        reporting, jobId, notificationId
      } = await self.instantiateJob(req,
        docs.length + attachmentsInfo.length
      );

      console.log('reporting', reporting);

      /* reporting.setTotal(docs.length + attachmentsInfo.length); */

      const { duplicatedDocs, duplicatedIds } = await self.insertDocs(req, docs, reporting);
      const importedAttachments = await self.insertAttachments(req, {
        attachmentsInfo,
        reporting,
        duplicatedIds
      });

      const results = {
        duplicatedDocs,
        importedAttachments,
        type: self.__meta.name,
        exportPath
      };

      /* reporting.setResults(results); */

      await self.cleanFile(filePath);
    },

    async instantiateJob(req, total) {
      const jobManager = self.apos.modules['@apostrophecms/job'];
      const job = await jobManager.start();
      const notification = await jobManager.triggerNotification(req, 'progress', {
        jobId: job._id
      });
      await jobManager.setTotal(total);

      return {
        reporting: {
          success (n) {
            return jobManager.success(job, n);
          },
          failure (n) {
            return jobManager.failure(job, n);
          }
        },
        jobId: job._id,
        notificationId: notification._id
      };
    },

    async readExportFile(req) {
      const { file } = req.files || {};

      if (!file) {
        throw self.apos.error('invalid');
      }

      const format = Object
        .values(self.formats)
        .find((format) => format.type === file.type);

      if (!format) {
        throw self.apos.error('invalid');
      }

      try {
        const exportPath = await format.input(file.path);

        return {
          ...await self.getFilesData(exportPath),
          filePath: file.path
        };
      } catch (error) {
        await self.apos.notification.trigger(req, 'aposImportExport:importFileError', {
          interpolate: { format: format.label },
          dismiss: true,
          icon: 'alert-circle-icon',
          type: 'error'
        });
        throw self.apos.error(error.message);
      }
    },

    async getFilesData(exportPath, docIds) {
      const docs = await fsp.readFile(path.join(exportPath, 'aposDocs.json'));
      const attachments = await fsp.readFile(path.join(exportPath, 'aposAttachments.json'));

      return {
        docs: !docIds
          ? EJSON.parse(docs)
          : EJSON.parse(docs).filter(({ aposDocId }) => docIds.includes(aposDocId)),
        attachmentsInfo: EJSON.parse(attachments).map((attachment) => ({
          attachment,
          file: {
            name: `${attachment.name}.${attachment.extension}`,
            path: path.join(
              exportPath,
              'attachments',
              `${attachment._id}-${attachment.name}.${attachment.extension}`
            )
          }
        })),
        exportPath
      };
    },

    async insertDocs(req, docs, reporting) {
      const duplicates = {
        duplicatedDocs: [],
        duplicatedIds: []
      };

      // TODO: run promises in parallel?
      for (const doc of docs) {
        const cloned = cloneDeep(doc);
        try {
          await self.insertOrUpdateDoc(req, doc);
          reporting.success();
        } catch (error) {
          // TODO: duplicated docs are also considered as a failure?
          // FIXME: it seems like the reporting is status is still 100% success even when there are duplicates (ie. even when `failure` is called...)

          if (self.apos.doc.isUniqueError(error)) {
            const isSingleton = self.apos.modules[cloned.type] &&
              self.apos.modules[cloned.type].options.singleton === true;

            if (isSingleton) {
              await self.insertOrUpdateDoc(req, cloned, 'update');
            } else if (cloned.aposMode === 'draft') {
              duplicates.duplicatedDocs.push({
                aposDocId: cloned.aposDocId,
                title: cloned.title,
                type: cloned.type
              });
              duplicates.duplicatedIds.push(cloned.aposDocId);
            }

            continue;
          }

          reporting.failure();
          self.apos.util.error(error);
        }
      }

      return duplicates;
    },

    async insertAttachments(req, {
      attachmentsInfo, reporting, duplicatedIds
    }) {
      const importedAttachments = [];

      for (const attachmentInfo of attachmentsInfo) {
        try {
          await self.insertOrUpdateAttachment(req, attachmentInfo, duplicatedIds);
          importedAttachments.push(attachmentInfo.attachment._id);
          reporting.success();
        } catch (err) {
          // TODO: How to manage progress with duplicates
          /* reporting.failure(); */
        }
      }

      return importedAttachments;
    },

    async insertOrUpdateDoc(req, doc, method = 'insert') {
      const manager = self.apos.page.isPage(doc)
        ? self.apos.page
        : self.apos.modules[doc.type];

      if (!manager) {
        throw new Error(`No manager found for this module: ${doc.type}`);
      }

      if (manager.options.autopublish === true && doc.aposMode === 'published') {
        return;
      }

      return manager[method](req, doc, { setModified: false });
    },

    async insertOrUpdateAttachment(req, { attachment, file }, duplicatedIds) {
      // TODO: Find a more efficient way to compare only relatedIds
      // (we need to find a way to keep autopublish published IDs in that case)
      if (duplicatedIds) {
        const relatedIds = attachment.docIds
          .reduce((acc, id) => {
            const aposId = id.replace(/:.+$/, '');
            return [
              ...acc,
              ...acc.includes(aposId) ? [] : [ aposId ]
            ];
          }, []);

        if (relatedIds.every((id) => duplicatedIds.includes(id))) {
          throw self.apos.error('Associated documents have not been imported');
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

    async cleanFile(exportPath) {
      try {
        const stat = await fsp.lstat(exportPath);
        if (stat.isDirectory()) {
          await fsp.rm(exportPath, {
            recursive: true,
            force: true
          });
        } else {
          await fsp.unlink(exportPath);
        }
      } catch (err) {
        self.apos.util.error(
          `Error while trying to remove the file or folder: ${exportPath}. You might want to remove it yourself.`
        );
      }
    }
  };
};
