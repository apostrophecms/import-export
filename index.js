const fs = require('fs');
const path = require('path');
const methods = require('./lib/methods');
const apiRoutes = require('./lib/apiRoutes');
const gzip = require('./lib/formats/gzip');

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
    }
  },
  init(self) {
    self.formats = {
      gzip,
      ...(self.options.formats || {})
    };

    self.enableBrowserData();
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
