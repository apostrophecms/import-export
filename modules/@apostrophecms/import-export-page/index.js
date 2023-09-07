module.exports = {
  improve: '@apostrophecms/page',

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

  apiRoutes(self) {
    if (self.options.importExport?.export === false) {
      return {};
    }

    return {
      post: {
        import: [
          require('connect-multiparty')(),
          req => {
            // `req.body` is not set because we are using form-data.
            // Add `messages` to `body` so the notification
            // displayed by the reporting works.
            req.body = { messages: req.body };

            return self.apos.modules['@apostrophecms/job'].run(
              req,
              (req, reporting) => self.apos.modules['@apostrophecms/import-export'].import(req, reporting)
            );
          }
        ],
        export(req) {
          // Add the page label to req.body for notifications.
          req.body.type = req.t('apostrophe:page');

          return self.apos.modules['@apostrophecms/import-export'].export(req, self);
        }
      }
    };
  }
};
