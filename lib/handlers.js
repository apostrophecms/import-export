
module.exports = (self) => {
  return {
    'apostrophe:modulesRegistered': {
      setContextOperations() {
        const excludedExportTypes = [];
        const excludedImportTypes = [];
        for (const mod of Object.values(self.apos.modules)) {
          if (!self.apos.instanceOf(mod, '@apostrophecms/doc-type')) {
            continue;
          }

          if (mod.options.importExport?.export === false) {
            excludedExportTypes.push({
              type: {
                $ne: mod.__meta.name
              }
            });
          }

          if (!mod.options.singleton || mod.options.importExport?.import === false) {
            excludedImportTypes.push({
              type: {
                $ne: mod.__meta.name
              }
            });
          }
        }

        const exportOperation = {
          action: 'import-export-export',
          context: 'update',
          label: 'aposImportExport:export',
          modal: 'AposExportModal',
          props: {
            action: 'import-export-export'
          },
          if: { $and: excludedExportTypes }
        };
        const importOperation = {
          action: 'import-export-import',
          context: 'update',
          label: 'aposImportExport:import',
          modal: 'AposImportModal',
          props: {
            action: 'import-export-import'
          },
          if: { $and: excludedImportTypes },
          conditions: [ 'canEdit' ]
        };

        self.apos.doc.addContextOperation(exportOperation);
        self.apos.doc.addContextOperation(importOperation);
      }
    }
  };
};
