module.exports = {
  improve: '@apostrophecms/page',

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

  apiRoutes(self) {
    if (self.options.export === false) {
      return {};
    }

    return {
      post: {
        exportOne(req) {
          // Add the page label to req.body for notifications.
          req.body.type = req.t('apostrophe:page');

          return self.apos.modules['@apostrophecms/import-export'].export(req, self);
        }
      }
    };
  }
};
