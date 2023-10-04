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
    ...importMethods(self),
    ...exportMethods(self)
  };
};
