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

    // Add import operation for singleton doc types
    if (self.options.singleton === true || !!self.options.singletonAuto) {
      if (self.options.importExport?.import === false) {
        return;
      }
      console.log('self.options.singleton', self.name, (self.options.singleton === true || !!self.options.singletonAuto), (self.options.singleton === true || self.options.singletonAuto));
      const importOperation = {
        action: 'import-export-import',
        context: 'update',
        label: 'aposImportExport:import',
        modal: 'AposImportModal',
        props: {
          action: 'import-export-import'
        }
      };
      if (excludedTypes.length) {
        operation.if = { $and: excludedTypes };
      }

      self.apos.doc.addContextOperation(importOperation);
    }
  }
};
