const path = require('path');
const fsp = require('node:fs/promises');
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

      // TODO: handle reporting when importing docs and attachments
      // TODO: handle attachment files
      // TODO: make `readExportFile` return a stream to read it and import docs directly?
      const {
        docs,
        attachments
        // attachmentsPath
      } = await self.readExportFile(req, file);

      console.log('reporting -> total', docs.length + attachments.length);

      // TODO: add the number of attachment files to the total
      reporting.setTotal(docs.length + attachments.length);
      console.log('🚀 ~ file: import.js:29 ~ import ~ reporting:', reporting);

      const duplicatedDocs = await self.insertDocs(req, docs, reporting);
      const duplicatedAttachments = await self.insertAttachments(attachments, reporting);

      console.log('🚀 ~ file: import.js:32 ~ import ~ duplicatedDocs:', duplicatedDocs);
      console.log('🚀 ~ file: import.js:34 ~ import ~ duplicatedAttachments:', duplicatedAttachments);

      // FIXME: the reporting does not seem to be working (no notification shown on the browser)
      reporting.setResults({
        duplicatedDocs,
        duplicatedAttachments
      });
    },

    async readExportFile(req, file) {
      const format = Object
        .values(self.formats)
        .find(format => format['content-type'] === file.headers['content-type']);

      if (!format) {
        throw self.apos.error('invalid');
      }

      let exportPath;
      try {
        exportPath = await format.input(file.path);
        console.log('exportPath', exportPath);
      } catch (error) {
        await self.apos.notification.trigger(req, 'aposImportExport:importFileError', {
          interpolate: { format: format.label },
          dismiss: true,
          icon: 'alert-circle-icon',
          type: 'error'
        });
        throw self.apos.error(error.message);
      }

      const docs = await fsp.readFile(path.join(exportPath, 'aposDocs.json'));
      const attachments = await fsp.readFile(path.join(exportPath, 'aposAttachments.json'));

      return {
        docs: EJSON.parse(docs),
        attachments: EJSON.parse(attachments)
      };
    },

    async insertDocs(req, docs, reporting) {
      return self.insertDocuments(
        docs,
        reporting,
        doc => self.apos.modules[doc.type].insert(req, doc)
      );
    },

    async insertAttachments(attachments, reporting) {
      return self.insertDocuments(
        attachments,
        reporting,
        attachment => self.apos.attachment.db.insertOne(attachment)
      );
    },

    async insertDocuments(documents, reporting, insert) {
      const duplicates = [];

      for (const document of documents) {
        try {
          await insert(document);
          reporting.success();
        } catch (error) {
          // TODO: duplicated docs are also considered as a failure?
          reporting.failure();

          const DUPLICATE_ERROR_CODE = 'E11000';
          if (error.message.includes(DUPLICATE_ERROR_CODE)) {
            // store docs that could not be inserted
            // because already existing in the database
            const duplicate = {
              _id: document._id,
              title: document.title,
              type: document.type
            };
            duplicates.push(duplicate);
            continue;
          }

          self.apos.util.error(error);
        }
      }

      return duplicates;
    }
  };
};
