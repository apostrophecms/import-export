module.exports = {
  improve: '@apostrophecms/doc-type',

  init(self) {
    if (self.options.export === false) {
      return;
    }

    self.apos.doc.addContextOperation(self.__meta.name, {
      action: 'export',
      context: 'update',
      label: 'aposImportExport:export',
      modal: 'AposExportPiecesModal',
    });
  },
}
