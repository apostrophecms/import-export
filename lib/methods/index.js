const exportMethods = require('./export');
const archiveMethods = require('./archive');

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
            extension: value.extension || key
          }))
      };
    },
    ...exportMethods(self),
    ...archiveMethods(self)
  };
};
