const excludedTypes = [];

module.exports = {
  improve: '@apostrophecms/doc-type',

  init(self) {
    const operation = {
      action: 'import-export-export',
      context: 'update',
      label: 'aposImportExport:export',
      modal: 'AposExportModal',
      props: {
        action: 'import-export-export'
      }
    };

    if (self.options.importExport?.export === false) {
      excludedTypes.push({
        type: {
          $ne: self.__meta.name
        }
      });
    }

    if (excludedTypes.length) {
      operation.if = { $and: excludedTypes };
    }

    self.apos.doc.addContextOperation(operation);
  }
};
