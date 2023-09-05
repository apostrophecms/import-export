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

  options: {
    name: '@apostrophecms/import-export',
    i18n: {
      ns: 'aposImportExport',
      browser: true
    }
  },

  init(self) {
    if (self.options.export !== false) {
      self.apos.asset.iconMap['apos-import-export-download-icon'] = 'Download';
    }
    if (self.options.import !== false) {
      self.apos.asset.iconMap['apos-import-export-upload-icon'] = 'Upload';
    }

    self.exportFormats = {
      gzip,
      ...(self.options.exportFormats || {})
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
