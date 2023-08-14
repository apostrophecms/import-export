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
            title: 'aposImportExport:importDocuments',
            description: 'aposImportExport:importModalDescription',
            confirmationButton: 'aposImportExport:import',
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
  }
};
