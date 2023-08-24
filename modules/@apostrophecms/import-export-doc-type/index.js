const excludedTypes = [];

module.exports = {
  improve: '@apostrophecms/doc-type',

  init(self) {
    const operation = {
      action: 'export',
      context: 'update',
      label: 'aposImportExport:export',
      modal: 'AposExportModal',
      props: {
        action: 'export-one'
      }
    };

    if (self.options.export === false) {
      excludedTypes.push({
        type: {
          $ne: self.__meta.name
        }
      });
      operation.if = {
        $and: excludedTypes
      };
    }

    self.apos.doc.addContextOperation(operation);
  }
};
