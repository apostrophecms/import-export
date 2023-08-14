module.exports = {
  improve: '@apostrophecms/page',

  utilityOperations (self) {
    // TODO: change to `self.options.shareDocsDisableImport === true` as set in the ticket?
    if (self.options.import === false) {
      return {};
    }

    return {
      add: {
        import: {
          label: 'aposImportExport:import',
          modalOptions: {
            title: 'aposImportExport:importType',
            descriptionStart: 'aposImportExport:importModalDescriptionStart',
            descriptionLink: 'aposImportExport:importModalDescriptionLink',
            descriptionEnd: 'aposImportExport:importModalDescriptionEnd',
            confirmationButton: 'aposImportExport:importType',
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
