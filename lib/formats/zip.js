const Zip = require('adm-zip');

module.exports = {
  label: 'Zip',
  output(filepath, data) {
    const zip = new Zip();

    for (const filename in data) {
      const content = data[filename];

      try {
        zip.addFile(filename, content);
      } catch (error) {
        self.apos.util.error('exportRecord error', error);
      }
    }

    zip.writeZip(filepath);

    return zip.toBuffer();
  }
};
