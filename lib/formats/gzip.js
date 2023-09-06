const { createWriteStream } = require('node:fs');
const zlib = require('node:zlib');
const tar = require('tar-stream');

module.exports = {
  label: 'gzip',
  extension: 'tgz',
  output
};

async function output(apos, filepath, data) {
  return new Promise((resolve, reject) => {
    let response;
    const output = createWriteStream(filepath);
    const pack = tar.pack();
    const gzip = zlib.createGzip();

    gzip.on('error', reject);

    output
      .on('error', reject)
      .on('finish', () => {
        resolve(response);
      });

    pack.pipe(gzip).pipe(output);

    for (const [ filename, content ] of Object.entries(data.json || {})) {
      addTarEntry(pack, { name: filename }, content).catch(reject);
    }

    compressAttachments(apos, pack, data.attachments || {})
      .then((res) => {
        response = res;
        pack.finalize();
      });
  });
}

function addTarEntry(pack, options, data = null) {
  return new Promise((resolve, reject) => {
    pack.entry(options, data, (err) => {
      if (err) {
        reject(err);
      }

      resolve();
    });
  });
}

async function compressAttachments(apos, pack, attachments = {}) {
  await addTarEntry(pack, {
    name: 'attachments/',
    type: 'directory'
  });

  const chunkedPromises = chunkPromises(getPromises(), 5);
  let attachmentError = false;

  for (const chunk of chunkedPromises) {
    const results = await Promise.allSettled(chunk);
    if (results.some(({ status }) => status === 'rejected')) {
      attachmentError = true;
    }
  }

  return { attachmentError };

  function getPromises() {
    return Object.entries(attachments).map(([ name, url ]) => {
      return new Promise((resolve, reject) => {
        apos.http.get(url, { originalResponse: true })
          .then((res) => {
            res.body.on('error', reject);

            res.buffer().then((buffer) => {
              addTarEntry(pack, { name: `attachments/${name}` }, buffer)
                .then(resolve)
                .catch(reject);
            })
              .catch(reject);
          })
          .catch(reject);
      });
    });
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
