const archiver = require('archiver');
const { compress } = require('./archiver');

module.exports = {
  label: 'Zip',
  extension: 'zip',
  output(apos, filepath, data) {
    const archive = archiver('zip');

    return compress(apos, filepath, data, archive);
  }
};
