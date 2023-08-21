const fs = require('node:fs/promises');
const path = require('path');
const util = require('util');

module.exports = (self) => {
  return {
    async exportRun(req, reporting, docs, attachments, options) {
      if (typeof reporting.setTotal === 'function') {
        const count = docs.length + attachments.length;
        reporting.setTotal(count);
      }

      const {
        extension,
        format,
        // batchSize,
        expiration
      } = options;

      const filename = `${self.apos.util.generateId()}-export.${extension}`;
      const filepath = path.join(self.apos.attachment.uploadfs.getTempPath(), filename);

      const docsData = JSON.stringify(docs, undefined, 2);
      const attachmentsData = JSON.stringify(attachments, undefined, 2);

      const stream = await format.output(filepath, {
        'aposDocs.json': docsData,
        'aposAttachments.json': attachmentsData
      });
      console.log('stream', stream.on);
      console.log('typeof stream', typeof stream);

      // Must copy it to uploadfs, the server that created it
      // and the server that delivers it might be different
      const downloadPath = path.join('/exports', filename);
      console.log('🚀 ~ file: export.js:34 ~ exportRun ~ downloadPath:', downloadPath);

      const copyIn = util.promisify(self.apos.attachment.uploadfs.copyIn);

      try {
        await copyIn(filepath, downloadPath);
      } catch (error) {
        console.log('🚀 ~ file: export.js:41 ~ exportRun ~ error:', error);
        await self.exportCleanup(filepath);
        throw error;
      }

      const downloadUrl = `${self.apos.attachment.uploadfs.getUrl()}${downloadPath}`;

      console.log('🚀 ~ file: export.js:48 ~ exportRun ~ downloadUrl:', downloadUrl);
      reporting.setResults({
        url: downloadUrl
      });

      await self.apos.notification.trigger(req, 'Exported {{ count }} {{ type }}.', {
        interpolate: {
          count: docs.length,
          type: docs.length > 1
            ? req.t('apostrophe:documents')
            : req.t('apostrophe:document')
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
