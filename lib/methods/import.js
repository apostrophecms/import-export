const path = require('path');
const fsp = require('node:fs/promises');
const { cloneDeep } = require('lodash');
const { EJSON } = require('bson');

module.exports = self => {
  return {
    async import(req, reporting) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

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

      const {
        docs,
        attachmentsInfo,
        exportPath
      } = await self.readExportFile(req, file.path, format);

      reporting.setTotal(docs.length + attachmentsInfo.length);

      const { duplicatedDocs, duplicatedIds } = await self.insertDocs(req, docs, reporting);
      await self.insertAttachments(req, {
        attachmentsInfo,
        reporting,
        duplicatedIds
      });

      const results = {
        duplicatedDocs,
        type: self.__meta.name,
        exportPath
      };

      reporting.setResults(results);

      await self.cleanFile(file.path);
    },

    async readExportFile(req, filePath, format) {
      let exportPath;
      try {
        exportPath = await format.input(filePath);
      } catch (error) {
        await self.apos.notification.trigger(req, 'aposImportExport:importFileError', {
          interpolate: { format: format.label },
          dismiss: true,
          icon: 'alert-circle-icon',
          type: 'error'
        });
        throw self.apos.error(error.message);
      }

      return self.getFilesData(exportPath);
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
      return self.insertDocuments(
        docs,
        reporting,
        (doc, method) => self.insertDoc(req, doc, method)
      );
    },

    async insertDoc(req, doc, method = 'insert') {
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

    async insertAttachments(req, {
      attachmentsInfo, reporting, duplicatedIds
    }) {
      return self.insertDocuments(
        attachmentsInfo,
        reporting,
        async (attachmentInfo) => self.insertOrUpdateAttachment(req,
          attachmentInfo,
          duplicatedIds
        ));
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
          return;
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

    async insertDocuments(documents, reporting, insert) {
      const duplicates = {
        duplicatedDocs: [],
        duplicatedIds: []
      };

      // TODO: run promises in parallel?
      for (const document of documents) {
        const doc = cloneDeep(document);
        try {
          await insert(document);
          reporting.success();
        } catch (error) {
          // TODO: duplicated docs are also considered as a failure?
          // FIXME: it seems like the reporting is status is still 100% success even when there are duplicates (ie. even when `failure` is called...)
          reporting.failure();

          if (self.apos.doc.isUniqueError(error)) {
            const isSingleton = self.apos.modules[doc.type] &&
              self.apos.modules[doc.type].options.singleton === true;

            if (isSingleton) {
              await insert(doc, 'update');
            } else if (doc.aposMode === 'draft') {
              duplicates.duplicatedDocs.push({
                aposDocId: doc.aposDocId,
                title: doc.title,
                type: doc.type
              });
              duplicates.duplicatedIds.push(doc.aposDocId);
            }

            continue;
          }

          self.apos.util.error(error);
        }
      }

      return duplicates;
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
