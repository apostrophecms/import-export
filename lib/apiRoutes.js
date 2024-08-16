const MAX_RECURSION = 10;

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
        if (!type) {
          throw self.apos.error('invalid');
        }

        const { schema = [] } = self.apos.modules[type];

        // Limit recursions in order to avoid the "Maximum call stack size exceeded" error
        // if widgets or pieces are related to themselves.
        return findSchemaRelatedTypes(schema);

        function findSchemaRelatedTypes(schema, related = [], recursions = 0) {
          recursions++;
          if (recursions >= MAX_RECURSION) {
            return related;
          }
          for (const field of schema) {
            if (field.type === 'relationship') {
              if (self.canExport(req, field.withType) && !related.includes(field.withType)) {
                related.push(field.withType);
                const relatedManager = self.apos.doc.getManager(field.withType);
                findSchemaRelatedTypes(relatedManager.schema, related, recursions);
              }
            } else if ([ 'array', 'object' ].includes(field.type)) {
              findSchemaRelatedTypes(field.schema, related, recursions);
            } else if (field.type === 'area') {
              const widgets = self.apos.area.getWidgets(field.options);
              for (const widget of Object.keys(widgets)) {
                const { schema = [] } = self.apos.modules[`${widget}-widget`];
                findSchemaRelatedTypes(schema, related, recursions);
              }
            }
          }

          return related;
        }
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
