module.exports = self => {
  return {
    async import(req) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      return self.apos.modules['@apostrophecms/job'].run(
        req,
        (req, reporting) => self.extractArchive(req, reporting)
      );
    }
  };
};
