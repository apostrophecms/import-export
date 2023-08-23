const archiver = require('archiver');
const { compress } = require('./archiver');

module.exports = {
  label: 'Zip',
  output(filepath, data) {
    const archive = archiver('zip');

    return compress(filepath, data, archive);
  }
};
