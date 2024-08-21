module.exports = self => {
  if (self.options.importExport?.export === false) {
    return {};
  }

  return {
    get: {
      async related(req) {
        if (!req.user) {
          throw self.apos.error('forbidden');
        }

        const type = self.apos.launder.string(req.query.type);
        const manager = self.apos.doc.getManager(type);
        if (!manager) {
          throw self.apos.error('invalid');
        }

        return self.getRelatedTypes(req, manager.schema);
      }
    },
    post: {
      async overrideDuplicates(req) {
        return self.overrideDuplicates(req);
      },

      async cleanExport(req) {
        return self.cleanExport(req);
      }
    }
  };
};
