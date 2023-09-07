const path = require('path');
const fsp = require('node:fs/promises');
const { EJSON } = require("bson");

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

      // TODO: handle attachment files
      const { docs, attachments } = await self.readExportFile(req, reporting, file);

      // TODO: import docs and attachments
      console.dir(docs, { depth: 9 });
      console.dir(attachments, { depth: 9 });
    },

    async readExportFile(req, reporting, file) {
      const format = Object
        .values(self.formats)
        .find(format => format['content-type'] === file.headers['content-type']);

      if (!format) {
        throw self.apos.error('invalid');
      }

      let exportPath;
      try {
        exportPath = await format.input(file.path, file.name);
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
    }
  };
};
