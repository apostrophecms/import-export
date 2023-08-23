const fs = require('node:fs/promises');
const path = require('path');
const util = require('util');

module.exports = (self) => {
  return {
    async exportRun(req, reporting, docs, attachments, options) {
      const {
        extension,
        format,
        expiration
      } = options;

      const specificExtension = self.exportFormats[extension].extension;

      const filename = `${self.apos.util.generateId()}-export.${specificExtension || extension}`;
      const filepath = path.join(self.apos.attachment.uploadfs.getTempPath(), filename);

      const docsData = JSON.stringify(docs, undefined, 2);
      const attachmentsData = JSON.stringify(attachments, undefined, 2);

      const data = {
        'aposDocs.json': docsData,
        'aposAttachments.json': attachmentsData
        // attachments: 'attachments/' // TODO: add attachment into an "/attachments" folder
      };

      await format.output(filepath, data);

      // Must copy it to uploadfs, the server that created it
      // and the server that delivers it might be different
      const downloadPath = path.join('/exports', filename);

      const copyIn = util.promisify(self.apos.attachment.uploadfs.copyIn);

      try {
        await copyIn(filepath, downloadPath);
      } catch (error) {
        await self.exportCleanup(filepath);
        throw error;
      }

      const downloadUrl = `${self.apos.attachment.uploadfs.getUrl()}${downloadPath}`;

      if (reporting) {
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
            name: 'export-download',
            data: {
              url: downloadUrl
            }
          }
        });
      }

      await self.exportCleanup(filepath);

      // TODO: use cron instead?
      // Report is available for one hour by default
      setTimeout(() => {
        self.apos.attachment.uploadfs.remove(downloadPath, error => {
          if (error) {
            self.apos.util.error(error);
          }
        });
      }, expiration || 1000 * 60 * 60);

      return {
        url: downloadUrl
      };
    },
    async exportCleanup(filepath) {
      try {
        await fs.unlink(filepath);
      } catch (error) {
        self.apos.util.error(error);
      }
    }
  };
};
