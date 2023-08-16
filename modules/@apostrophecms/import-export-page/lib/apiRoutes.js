module.exports = self => {
  if (self.options.export === false) {
    return {};
  }

  return {
    get: {
      export(req) {
        return self.apos.modules['@apostrophecms/import-export'].export(req, self);
      }
    }
  };
};
