const { compress } = require('./archiver');

module.exports = {
  label: 'gzip',
  extension: 'tar.gz',
  output(apos, filepath, data) {
    return compress(apos, filepath, data);
  }
};
