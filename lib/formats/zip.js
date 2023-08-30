const archiver = require('archiver');
const { compress } = require('./archiver');

module.exports = {
  label: 'Zip',
  output(apos, filepath, data) {
    const archive = archiver('zip');

    return compress(apos, filepath, data, archive);
  }
};
