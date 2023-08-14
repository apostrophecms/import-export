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

  init(self) {
    self.apos.asset.iconMap['apos-import-export-download-icon'] = 'Download';
    self.apos.asset.iconMap['apos-import-export-upload-icon'] = 'Upload';
  },

  apiRoutes(self) {
    return {
      get: {
        async related(req) {
          if (!req.user) {
            throw self.apos.error('forbidden');
          }

          const type = self.apos.launder.string(req.query.type);
          if (!type) {
            throw self.apos.error('invalid');
          }

          const { schema = [] } = self.apos.modules[type];
          const relatedTypes = schema
            .flatMap(searchRelationships)
            .filter(Boolean);

          return [ ...new Set(relatedTypes) ];

          function searchRelationships(obj) {
            if (obj.type === 'relationship') {
              return obj.withType;
            } else if (obj.type === 'array' || obj.type === 'object') {
              return obj.schema.flatMap(searchRelationships);
            } else if (obj.type === 'area') {
              return Object.keys(obj.options.widgets).flatMap(widget => {
                const { schema = [] } = self.apos.modules[`${widget}-widget`];
                return schema.flatMap(searchRelationships);
              });
            }
          }
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
