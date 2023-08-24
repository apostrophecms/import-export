const { createWriteStream } = require('node:fs');

module.exports = {
  compress
};

function compress(filepath, data, archive) {
  return new Promise((resolve, reject) => {
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
