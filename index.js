const fs = require('fs');
const path = require('path');

module.exports = {
  bundle: {
    directory: 'modules',
    modules: getBundleModuleNames()
  },

  options: {
    name: '@apostrophecms/import-export',
    i18n: {
      ns: 'aposImportExport',
      browser: true
    }
  },

  apiRoutes(self) {
    return {
      get: {
        async related(req) {
          if (!req.user) {
            throw self.apos.error('forbidden');
          }
          const moduleName = self.apos.launder.string(req.query.moduleName);
          if (!moduleName) {
            return { success: false };
          }
          const schema = self.apos.modules[moduleName].schema;

          const relatedTypes = schema.reduce((acc, cur) => {
            if (cur.type === 'relationship') {
              acc.push(cur.withType);
            } else if (cur.type === 'array' || cur.type === 'object') {
              for (const field of cur.schema) {
                if (field.type === 'relationship') {
                  acc.push(field.withType);
                }
              }
              // } else if (cur.type === 'area') {

            }

            return acc;
          }, []);

          console.log('relatedTypes', require('util').inspect([ ...new Set(relatedTypes) ], {
            colors: true,
            depth: 1
          }));

          return { success: true };
        }
      }
    };
  }
};

function getBundleModuleNames() {
  const source = path.join(__dirname, './modules/@apostrophecms');
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => `@apostrophecms/${dirent.name}`);
}
