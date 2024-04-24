const fsp = require('node:fs/promises');
const importMethods = require('./import');
const exportMethods = require('./export');

module.exports = self => {
  return {
    registerFormats(formats = {}) {
      self.formats = {
        ...self.formats,
        ...formats
      };
    },
    // No need to override, the parent method returns `{}`.
    getBrowserData() {
      return {
        formats: Object
          .entries(self.formats)
          .map(([ key, value ]) => ({
            name: key,
            label: value.label,
            allowedExtension: value.allowedExtension
          }))
      };
    },
    // Filter our docs that have their module with the import or export option set to false
    // and docs that have "admin only" permissions when the user is not an admin.
    // If a user does not have at lease the permission to view the draft, he won't
    // be able to import or export it.
    canImportOrExport(req, docType, action) {
      const docModule = self.apos.modules[docType];

      if (!docModule) {
        return false;
      }
      if (docModule.options.importExport?.[action] === false) {
        return false;
      }
      if (!self.apos.permission.can(req, 'view', docType)) {
        return false;
      }

      return true;
    },

    async remove(filepath) {
      try {
        const stat = await fsp.lstat(filepath);
        if (stat.isDirectory()) {
          await fsp.rm(filepath, {
            recursive: true,
            force: true
          });
        } else {
          await fsp.unlink(filepath);
        }
        console.info(`removed: ${filepath}`);
      } catch (err) {
        console.trace();
        self.apos.util.error(
          `Error while trying to remove the file or folder: ${filepath}. You might want to remove it yourself.`
        );
      }
    },

    ...importMethods(self),
    ...exportMethods(self)
  };
};
