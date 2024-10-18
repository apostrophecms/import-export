const fs = require('fs');
const path = require('path');
const handlers = require('./lib/handlers');
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
    preventUpdateAssets: false,
    importDraftsOnlyDefault: false
  },
  init(self) {
    self.formats = {
      ...formats,
      ...self.options.formats || {}
    };

    self.enableBrowserData();
    self.timeoutIds = {};
  },
  handlers,
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
