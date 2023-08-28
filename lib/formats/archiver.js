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

    for (const [ filename, content ] of Object.entries(data.json || {})) {
      archive.append(content, { name: filename });
    }

    compressAttachments(apos, archive, data.attachments || {})
      .finally(() => {
        archive.finalize();
      });
  });
}

// If one image download fail should we stop the entire process?
async function compressAttachments(apos, archive, attachments = {}) {
  const promises = Object.entries(attachments).map(([ name, url ]) => {
    return new Promise((resolve, reject) => {
      apos.http.get(url, { originalResponse: true })
        .then((res) => {
          res.body.on('error', reject);
          res.body.on('end', resolve);

          archive.append(res.body, {
            name: `attachments/${name}`
          });
        }).catch((err) => {
          reject(err);
        });
    });
  });

  const chunkedPromises = chunkPromises(promises, 2);
  try {
    for (const chunk of chunkedPromises) {
      const res = await Promise.all(chunk);
      console.log('res', res);
    }
  } catch (err) {
    console.log('err', err);
  // TODO should we stop the whole process? At least notify the user that an attachment could not be downloaded
  }
}

function chunkPromises(attachments, max) {
  const length = Math.ceil(attachments.length / max);
  return Array(length).fill([]).map((chunk, i) => {
    const position = i * max;
    return [
      ...chunk,
      ...attachments.slice(position, position + max)
    ];
  });
}
