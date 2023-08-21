const zlib = require('node:zlib');
const { promisify } = require('node:util');

const gzip = promisify(zlib.gzip);

function createGzip(input) {
  return gzip(JSON.stringify(input));
}

module.exports = {
  createGzip
};
