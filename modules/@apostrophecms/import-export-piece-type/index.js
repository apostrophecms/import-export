const multiparty = require('connect-multiparty');

module.exports = {
  improve: '@apostrophecms/piece-type',
  cascades: [ 'batchOperations' ],
  utilityOperations (self) {
    if (self.options.importExport?.import === false) {
      return {};
    }

    return {
      add: {
        import: {
          label: 'aposImportExport:import',
          modalOptions: {
            modal: 'AposImportModal'
          },
          messages: {
            progress: 'aposImportExport:importing',
            completed: 'aposImportExport:imported',
            icon: 'database-export-icon',
            resultsEventName: 'import-duplicates'
          }
        }
      }
    };
  },
  batchOperations(self) {
    if (self.options.importExport?.export === false) {
      return;
    }

    return {
      add: {
        'export-batch': {
          label: 'aposImportExport:export',
          messages: {
            progress: 'aposImportExport:exporting',
            completed: 'aposImportExport:exported',
            icon: 'database-export-icon',
            resultsEventName: 'export-download'
          },
          modal: 'AposExportModal'
        }
      },
      group: {
        more: {
          icon: 'dots-vertical-icon',
          operations: [ 'export-batch' ]
        }
      }
    };
  },
  apiRoutes(self) {
    if (self.options.importExport?.export === false) {
      return {};
    }

    return {
      post: {
        import: [
          multiparty(),
          async (req) => {
            if (!req.user) {
              throw self.apos.error('forbidden');
            }

            // TODO: You say body is not set but you use req.body?
            // `req.body` is not set because we are using form-data.
            // Add `messages` to `body` so the notification
            // displayed by the reporting works.
            req.body = { messages: req.body };

            const importExportManager = self.apos.modules['@apostrophecms/import-export'];
            const data = await importExportManager.readExportFile(req);

            console.dir(data, { depth: 1 });
            return self.apos.modules['@apostrophecms/job'].run(
              req,
              (req, reporting) => importExportManager.import(req, reporting, data)
            );
          }
        ],
        export(req) {
          // Add the piece type label to req.body for notifications.
          req.body.type = req.t(self.options.label);

          return self.apos.modules['@apostrophecms/import-export'].export(req, self);
        },
        // NOTE: this route is used in batch operations, and its method should be POST
        // in order to make the job work with the progress notification.
        // The other 'export' routes that are used by context operations on each doc
        // are also POST for consistency.
        exportBatch(req) {
          // Add the piece type label to req.body for notifications.
          // Should be done before calling the job's `run` method.
          req.body.type = req.body._ids.length === 1
            ? req.t(self.options.label)
            : req.t(self.options.pluralLabel);

          // FIXME: the progress notification is not always dismissed.
          // Probably a fix that needs to be done in job core module.
          return self.apos.modules['@apostrophecms/job'].run(
            req,
            (req, reporting) => self.apos.modules['@apostrophecms/import-export']
              .export(req, self, reporting)
          );
        }
      }
    };
  }
};
