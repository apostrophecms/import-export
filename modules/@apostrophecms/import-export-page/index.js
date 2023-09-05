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
            progress: 'Importing {{ type }}...'
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
        import(req) {
          return self.apos.modules['@apostrophecms/import-export'].import(req);
        },
        exportOne(req) {
          // Add the page label to req.body for notifications.
          req.body.type = req.t('apostrophe:page');

          return self.apos.modules['@apostrophecms/import-export'].export(req, self);
        }
      }
    };
  }
};
