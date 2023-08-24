const { createWriteStream } = require('node:fs');

module.exports = {
  compress
};

function compress(apos, filepath, data, archive) {
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

      if (filename !== 'attachments') {
        /* archive.append(content, { name: filename }); */
        continue;
      }
    }

    compressAttachments(apos, archive, data.attachments)
      .finally(() => {
        archive.finalize();
      });
  });
}

// If one image download fail should we stop the entire process?
async function compressAttachments(apos, archive, attachments = {}) {
  const promises = Object.entries(attachments).map(([ name, url ]) => {
    return new Promise((resolve, reject) => {
      apos.http.get(url, { fullResponse: true })
        .then((res) => res.arrayBuffer())
        .then((buf) => {
          archive.append(buf, { name: `attachments/${name}` });
          resolve();
        }).catch((err) => {
          reject(err);
        });
    });
  });

  return Promise.all(promises);
}
