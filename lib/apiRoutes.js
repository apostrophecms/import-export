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

        // option in their module configuration
        function searchRelationships(obj) {
          const shouldRecurse = recursions <= maxRecursions;

          if (obj.type === 'relationship') {
            // Filter out types that have the `relatedDocument` option set to `false` in their module.
            // Use `home-page` because this option is set on the page-type module,
            // which does not actually exist inside `apos.modules`:
            const module = obj.withType === '@apostrophecms/page'
              ? 'home-page'
              : obj.withType;

            return self.apos.modules[module].options.relatedDocument === false && obj.withType;
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
