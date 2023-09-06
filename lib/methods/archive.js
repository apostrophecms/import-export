const fs = require('node:fs/promises');
const path = require('path');
const util = require('util');

module.exports = self => {
  return {
    async createArchive(req, reporting, data, options) {
      const {
        format,
        expiration
      } = options;

      const filename = `${self.apos.util.generateId()}-export.${format.extension}`;
      const filepath = path.join(self.apos.attachment.uploadfs.getTempPath(), filename);

      try {
        const { attachmentError } = await format.output(self.apos, filepath, data);
        if (attachmentError) {
          await self.apos.notification.trigger(req, 'aposImportExport:exportAttachmentError', {
            interpolate: { format: format.label },
            dismiss: true,
            icon: 'alert-circle-icon',
            type: 'warning'
          });
        }
      } catch ({ message }) {
        self.apos.util.error(message);
        await self.apos.notification.trigger(req, 'aposImportExport:exportFileGenerationError', {
          interpolate: { format: format.label },
          dismiss: true,
          icon: 'alert-circle-icon',
          type: 'error'
        });
      }

      // TODO: Make it work properly with UploadFS
      // Must copy it to uploadfs, the server that created it
      // and the server that delivers it might be different
      const downloadPath = path.join('/exports', filename);
      const downloadUrl = `${self.apos.attachment.uploadfs.getUrl()}${downloadPath}`;

      const copyIn = util.promisify(self.apos.attachment.uploadfs.copyIn);
      try {
        await copyIn(filepath, downloadPath);
      } catch (error) {
        await self.removeArchive(filepath);
        throw error;
      }

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

      console.log('filepath', filepath);
      await self.removeArchive(filepath);
      /* self.removeArchiveFromUploadFs(downloadPath, expiration); */

      return {
        url: downloadUrl
      };
    },

    async removeArchive(filepath) {
      try {
        await fs.unlink(filepath);
      } catch (error) {
        self.apos.util.error(error);
      }
    },

    // Report is available for one hour by default
    removeArchiveFromUploadFs(downloadPath, expiration) {
      // TODO: use cron instead?
      setTimeout(() => {
        self.apos.attachment.uploadfs.remove(downloadPath, error => {
          if (error) {
            self.apos.util.error(error);
          }
        });
      }, expiration || 1000 * 60 * 60);
    }
  };
};
