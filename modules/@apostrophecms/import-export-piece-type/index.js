module.exports = {
  improve: '@apostrophecms/piece-type',

  cascades: [ 'batchOperations' ],

  utilityOperations (self) {
    if (self.options.import === false) {
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
            progress: 'Importing {{ type }}...'
          },
          requestOptions: {
            extension: 'zip'
          }
        }
      }
    };
  },

  batchOperations(self) {
    if (self.options.export === false) {
      return;
    }

    return {
      add: {
        export: {
          label: 'aposImportExport:export',
          messages: {
            progress: 'aposImportExport:exporting',
            completed: 'aposImportExport:exported'
          },
          modal: 'AposExportModal'
        }
      },
      group: {
        more: {
          icon: 'dots-vertical-icon',
          operations: [ 'export' ]
        }
      }
    };
  },

  apiRoutes(self) {
    if (self.options.export === false) {
      return {};
    }

    return {
      post: {
        // NOTE: this route is used in batch operations, and its method should be POST
        // in order to make the job work with the progress notification.
        // The other `exportOne` routes that are used by context operations on each doc
        // are also POST for consistency.
        export(req) {
          // Add the piece type label to req.body for notifications.
          // Should be done before calling the job's `run` method.
          req.body.type = req.body._ids.length === 1
            ? req.t(self.options.label)
            : req.t(self.options.pluralLabel);

          const options = {
            notificationOptions: {
              dismiss: true,
              resultsEvent: 'export-download'
            }
          };

          return self.apos.modules['@apostrophecms/job'].run(
            req,
            (req, reporting) => self.apos.modules['@apostrophecms/import-export'].export(req, self, reporting),
            options
          );
        },
        exportOne(req) {
          return self.apos.modules['@apostrophecms/import-export'].export(req, self);
        }
      }
    };
  }
};
