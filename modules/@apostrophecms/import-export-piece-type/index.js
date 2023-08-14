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
            progress: 'aposImportExport:exporting'
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
  }
};
