const exportMethods = require('./export');
const archiveMethods = require('./archive');

module.exports = self => {
  return {
    // No need to override, the parent method returns `{}`.
    getBrowserData() {
      return {
        extensions: Object
          .entries(self.exportFormats)
          .map(([ key, value ]) => ({
            label: value.label,
            value: key
          }))
      };
    },

    ...exportMethods(self),
    ...archiveMethods(self)
  };
};
