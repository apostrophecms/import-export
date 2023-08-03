const excludedTypes = [];

module.exports = {
  improve: '@apostrophecms/doc-type',

  init(self) {
    const criteria = {
      action: 'export',
      context: 'update',
      label: 'aposImportExport:export',
      modal: 'AposExportPiecesModal',
      currentModuleName: true
    };

    if (self.options.export === false) {
      excludedTypes.push({
        type: {
          $ne: self.__meta.name
        }
      });
      criteria.if = {
        $and: excludedTypes
      };
    }

    self.apos.doc.addContextOperation(self.__meta.name, criteria);
  }
};
