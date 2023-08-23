const fs = require('fs');
const path = require('path');
const Zip = require('adm-zip');
const methods = require('./lib/methods');
const apiRoutes = require('./lib/apiRoutes');

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
      // TODO: add gzip to use streams
      zip: {
        label: 'Zip',
        output(filepath, data) {
          const zip = new Zip();

          for (const filename in data) {
            try {
              zip.addFile(filename, data[filename]);
            } catch (error) {
              self.apos.util.error('exportRecord error', error);
            }
          }

          zip.writeZip(filepath);

          return zip.toBuffer();
        }
      },
      ...(self.options.exportFormats || {})
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
