const multiparty = require('connect-multiparty');

module.exports = {
  improve: '@apostrophecms/page',

  utilityOperations (self) {
    if (self.options.importExport?.import === false) {
      return {};
    }

    return {
      add: {
        'import-export-import': {
          label: 'aposImportExport:import',
          modalOptions: {
            modal: 'AposImportModal'
          },
          canCreate: true,
          canEdit: true
        }
      }
    };
  },

  apiRoutes(self) {
    return {
      post: {
        ...self.options.importExport?.import !== false && {
          importExportImport: [
            multiparty(),
            async (req) => {
              return self.apos.modules['@apostrophecms/import-export'].import(req, self.__meta.name);
            }
          ]
        },
        ...self.options.importExport?.export !== false && {
          importExportExport(req) {
            // Add the page label to req.body for notifications.
            req.body.type = req.t('apostrophe:page');

            return self.apos.modules['@apostrophecms/import-export'].export(req, self);
          }
        }
      }
    };
  }
};
