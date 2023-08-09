module.exports = {
  improve: '@apostrophecms/piece-type',

  cascades: [ 'batchOperations' ],

  utilityOperations (self) {
    return self.options.import !== false
      ? {
        add: {
          import: {
            label: 'aposImportExport:import',
            modalOptions: {
              title: 'aposImportExport:importType',
              descriptionStart: 'aposImportExport:importModalDescriptionStart',
              descriptionLink: 'aposImportExport:importModalDescriptionLink',
              descriptionEnd: 'aposImportExport:importModalDescriptionEnd',
              confirmationButton: 'aposImportExport:importType',

              // TODO: rename AposImportPiecesModal to AposImportModal since pages can be imported, not only pieces
              modal: 'AposImportPiecesModal'
            },
            messages: {
              progress: 'Importing {{ type }}...'
            },
            requestOptions: {
              extension: 'zip'
            }
          }
        }
      }
      : {};
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
