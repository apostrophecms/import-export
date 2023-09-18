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

      // TODO: make `readExportFile` return a stream to read it and import docs directly?
      const {
        docs,
        attachments
      } = await self.readExportFile(req, file);

      reporting.setTotal(docs.length + attachments.length);

      const duplicatedDocs = await self.insertDocs(req, docs, reporting);
      /* const duplicatedAttachments = await self.insertAttachments(req, attachments, reporting); */

      const results = {
        duplicatedDocs
        /* duplicatedAttachments */
      };

      // FIXME: the reporting does not seem to be working (no notification shown on the browser)
      // Send duplicates to the browser in order to let the user handle them
      reporting.setResults(results);
    },

    async readExportFile(req, file) {
      const format = Object
        .values(self.formats)
        .find(format => format.type === file.type);

      if (!format) {
        throw self.apos.error('invalid');
      }

      let exportPath;
      try {
        exportPath = await format.input(file.path);
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
        attachments: EJSON.parse(attachments).map(({
          _id, name, extension
        }) => ({
          file: {
            name: `${name}.${extension}`,
            path: path.join(exportPath, 'attachments', `${_id}-${name}.${extension}`)
          },
          options: {
            existingId: _id
          }
        }))
      };
    },

    async insertDocs(req, docs, reporting) {
      return self.insertDocuments(
        docs,
        reporting,
        doc => self.apos.modules[doc.type].insert(req, doc)
      );
    },

    async insertAttachments(req, attachments, reporting) {
      return self.insertDocuments(
        attachments,
        reporting,
        ({ file, options }) => self.apos.attachment.insert(req, file, options)
      );
    },

    async insertDocuments(documents, reporting, insert) {
      const duplicates = [];

      // TODO: run promises in parallel?
      for (const document of documents) {
        try {
          await insert(document);
          reporting.success();
        } catch (error) {
          // TODO: duplicated docs are also considered as a failure?
          // FIXME: it seems like the reporting is status is still 100% success even when there are duplicates (ie. even when `failure` is called...)
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
