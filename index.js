const fs = require('fs');
const path = require('path');
const methods = require('./lib/methods');
const apiRoutes = require('./lib/apiRoutes');
const formats = require('./lib/formats');

module.exports = {
  bundle: {
    directory: 'modules',
    modules: getBundleModuleNames()
  },
  icons: {
    'database-import-icon': 'DatabaseImport'
  },
  options: {
    name: '@apostrophecms/import-export',
    i18n: {
      ns: 'aposImportExport',
      browser: true
    },
    preventUpdateAssets: false
  },
  init(self) {
    self.formats = {
      ...formats,
      ...self.options.formats || {}
    };

    self.enableBrowserData();
  },
  handlers(self) {
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
            if: { $and: excludedImportTypes },
            canCreate: true,
            canEdit: true
          };

          self.apos.doc.addContextOperation(exportOperation);
          self.apos.doc.addContextOperation(importOperation);
        }
      }
    };
  },
  methods,
  apiRoutes
};

function getBundleModuleNames() {
  const source = path.join(__dirname, './modules/@apostrophecms');
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => `@apostrophecms/${dirent.name}`);
}
