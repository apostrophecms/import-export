const { createWriteStream } = require('node:fs');

module.exports = {
  compress
};

function compress(apos, filepath, data, archive) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(filepath);
    let response;

    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        console.warn(err);
      } else {
        reject(err);
      }
    });
    archive.on('error', reject);
    archive.on('finish', () => {
      resolve(response);
    });
    archive.pipe(output);

    for (const [ filename, content ] of Object.entries(data.json || {})) {
      archive.append(content, { name: filename });
    }

    compressAttachments(apos, archive, data.attachments || {})
      .then((res) => {
        response = res;
        archive.finalize();
      });
  });
}

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
        })
        .catch(reject);
    });
  });

  const chunkedPromises = chunkPromises(promises, 5);
  let attachmentError = false;

  for (const chunk of chunkedPromises) {
    const results = await Promise.allSettled(chunk);
    if (results.some(({ status }) => status === 'rejected')) {
      attachmentError = true;
    }
  }

  return { attachmentError };
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
