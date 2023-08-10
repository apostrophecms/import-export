module.exports = {
  improve: '@apostrophecms/piece-type',

  cascades: [ 'batchOperations' ],

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
