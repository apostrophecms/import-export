const { createWriteStream } = require('node:fs');
const archiver = require('archiver');

module.exports = {
  label: 'Gzip',
  extension: 'tar.gz',
  output(filepath, data) {
    return new Promise((resolve, reject) => {
      const archive = archiver('tar', { gzip: true });
      const output = createWriteStream(filepath);

      archive.on('warning', function(err) {
        if (err.code === 'ENOENT') {
          console.warn(err);
        } else {
          reject(err);
        }
      });
      archive.on('error', reject);
      archive.on('finish', resolve);

      archive.pipe(output);

      for (const filename in data) {
        const content = data[filename];

        if (content.endsWith('/')) {
          archive.directory(content, filename);
          continue;
        }

        archive.append(content, { name: filename });
      }

      archive.finalize();
    });
  }
};
