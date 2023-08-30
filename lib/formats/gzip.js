const archiver = require('archiver');
const { compress } = require('./archiver');

module.exports = {
  label: 'gzip',
  extension: 'tar.gz',
  output(apos, filepath, data) {
    const archive = archiver('tar', { gzip: true });

    return compress(apos, filepath, data, archive);
  }
};
