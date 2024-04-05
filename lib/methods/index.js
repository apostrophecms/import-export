const importMethods = require('./import');
const exportMethods = require('./export');

module.exports = self => {
  return {
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
    ...importMethods(self),
    ...exportMethods(self)
  };
};
