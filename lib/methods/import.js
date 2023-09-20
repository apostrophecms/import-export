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

      const {
        docs,
        attachments
      } = await self.readExportFile(req, file, format);

      reporting.setTotal(docs.length + attachments.length);

      const duplicatedDocs = await self.insertDocs(req, docs, reporting);
      await self.insertAttachments(req, attachments, reporting, duplicatedDocs.map(({ _id }) => _id));

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
        attachments: EJSON.parse(attachments).map((attachment) => ({
          attachment,
          file: {
            name: `${attachment.name}.${attachment.extension}`,
            path: path.join(
              exportPath,
              'attachments',
              `${attachment._id}-${attachment.name}.${attachment.extension}`
            )
          }
        }))
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

    async insertAttachments(req, attachments, reporting, duplicatedDocsIds) {
      return self.insertDocuments(
        attachments,
        reporting,
        ({ attachment, file }) => {
          // TODO: Check only on AposDocId maybe??
          // Maybe we should only keep that for the client and get back docs from job during override.
          console.log('duplicatedDocsIds', duplicatedDocsIds, attachment.docIds);
          if (attachment.docIds.every((id) => duplicatedDocsIds.includes(id))) {
            console.log('do not inserting: ', attachment._id, attachment.name);
            return;
          }

          self.apos.attachment.insert(req,
            file,
            { attachmentId: attachment._id }
          );
        });
    },

    async insertDocuments(documents, reporting, insert) {
      const duplicates = [];

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
            } else {
              duplicates.push(doc);
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
        console.log('file.path', file.path);
        await fsp.unlink(file.path);
        await fsp.unlink(file.path.replace(`.${extension}`, ''));
      } catch (err) {
        self.apos.util.warn(
          `Uploaded temporary file ${file.path} was already removed, this should have been the responsibility of import process`
        );
      }
    }
  };
};
