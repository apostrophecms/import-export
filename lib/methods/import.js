module.exports = self => {
  return {
    async import(req) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      // const [ defaultFormatName ] = Object.keys(self.formats);
      // const formatName = self.apos.launder.string(req.body.formatName, defaultFormatName);

      // const format = self.formats[formatName];
      // if (!format) {
      //   throw self.apos.error('invalid');
      // }

      const { file } = req.files || {};
      console.log('🚀 ~ file: import.js:17 ~ import ~ file:', file);
      console.log('🚀 ~ file: import.js:20 ~ import ~ req.body:', req.body);
      console.log('🚀 ~ file: import.js:20 ~ import ~ req.body.files:', req.body.files);
      console.log('🚀 ~ file: import.js:20 ~ import ~ req.files:', req.files);

      if (!file) {
        throw self.apos.error('invalid');
      }

      return self.apos.modules['@apostrophecms/job'].run(
        req,
        (req, reporting) => self.readExportFile(req, reporting)
      );
    },

    async readExportFile(req, reporting) {
      console.log('EXTRACT ARCHIVE');
      // TODO: implement
      // TODO: handle reporting here, as we'll know how much docs will be imported

      // return {
      //   docs: {
      //     'aposDocs.json': EJSON.stringify(docs, undefined, 2),
      //     'aposAttachments.json': EJSON.stringify(attachments, undefined, 2)
      //   },
      //   attachments: urls
      // };
    }
  };
};
