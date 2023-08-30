module.exports = self => {
  if (self.options.export === false) {
    return {};
  }

  return {
    get: {
      async related(req) {
        if (!req.user) {
          throw self.apos.error('forbidden');
        }

        const type = self.apos.launder.string(req.query.type);
        if (!type) {
          throw self.apos.error('invalid');
        }

        const { schema = [] } = self.apos.modules[type];

        // Limit recursions in order to avoid the "Maximum call stack size exceeded" error
        // if widgets or pieces are related to themselves.
        const maxRecursions = 10;
        let recursions = 0;

        const relatedTypes = schema
          .flatMap(searchRelationships)
          .filter(Boolean);

        return [ ...new Set(relatedTypes) ];

        function searchRelationships(obj) {
          const shouldRecurse = recursions <= maxRecursions;
          const shouldInclude = self.apos.modules[obj.withType] &&
             self.apos.modules[obj.withType].options.export !== false;

          if (obj.type === 'relationship') {
            return shouldInclude && obj.withType;
          } else if (obj.type === 'array' || obj.type === 'object') {
            recursions++;
            return shouldRecurse && obj.schema.flatMap(searchRelationships);
          } else if (obj.type === 'area') {
            recursions++;
            return Object.keys(obj.options.widgets).flatMap(widget => {
              const { schema = [] } = self.apos.modules[`${widget}-widget`];
              return shouldRecurse && schema.flatMap(searchRelationships);
            });
          }
        }
      }
    }
  };
};
