const apiRoutes = require('./lib/apiRoutes');

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

  apiRoutes
};
