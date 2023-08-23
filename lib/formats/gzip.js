const archiver = require('archiver');
const { compress } = require('./archiver');

module.exports = {
  label: 'Gzip',
  extension: 'tar.gz',
  output(filepath, data) {
    const archive = archiver('tar', { gzip: true });

    return compress(filepath, data, archive);
  }
};
