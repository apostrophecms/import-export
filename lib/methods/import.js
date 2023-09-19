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
        .find(format => format.type === file.type);

      if (!format) {
        throw self.apos.error('invalid');
      }

      // TODO: make `readExportFile` return a stream to read it and import docs directly?
      const {
        docs,
        attachments
      } = await self.readExportFile(req, file, format);

      reporting.setTotal(docs.length + attachments.length);

      const duplicatedDocs = await self.insertDocs(req, docs, reporting);
      /* const duplicatedAttachments = await self.insertAttachments(req, attachments, reporting); */

      const results = {
        duplicatedDocs,
        type: self.__meta.name
        /* duplicatedAttachments */
      };

      await self.cleanFiles(file, format.extension);

      // FIXME: the reporting does not seem to be working (no notification shown on the browser)
      reporting.setResults(results);
    },

    async readExportFile(req, file, format) {
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
        async (doc, override = false) => {
          const manager = self.apos.page.isPage(doc)
            ? self.apos.page
            : self.apos.modules[doc.type];

          if (!manager) {
            throw new Error(`No manager found for this module: ${doc.type}`);
          }

          if (override) {
            await manager.delete(req, doc);
          }

          return manager.insert(req, doc);
        });
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
        const clone = cloneDeep(document);
        try {
          await insert(document);
          reporting.success();
        } catch (error) {
          // TODO: duplicated docs are also considered as a failure?
          // FIXME: it seems like the reporting is status is still 100% success even when there are duplicates (ie. even when `failure` is called...)
          reporting.failure();

          const DUPLICATE_ERROR_CODE = 'E11000';
          if (error.message.includes(DUPLICATE_ERROR_CODE)) {
            const isSingleton = self.apos.modules[clone.type] &&
              self.apos.modules[clone.type].options.singleton === true;

            if (isSingleton) {
              await insert(clone, true);
            } else {
              duplicates.push(clone);
            }

            continue;
          }

          self.apos.util.error(error);
        }
      }

      return duplicates;
    },

    async cleanFiles(file, extension) {
      try {
        await fsp.unlink(file.path);
        await fsp.unlink(file.path.replace(`.${extension}`, ''));
      } catch (err) {
        self.apos.util.warn(`Uploaded temporary file ${file.path} was already removed, this should have been the responsibility of import process`);
      }
    }
  };
};
