const archiver = require('archiver');
const { compress } = require('./archiver');

module.exports = {
  label: 'gzip',
  extension: 'tgz',
  output(apos, filepath, data) {
    const archive = archiver('tar', { gzip: true });

    return compress(apos, filepath, data, archive);
  }
};
