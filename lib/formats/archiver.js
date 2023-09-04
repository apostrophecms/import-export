const { createWriteStream } = require('node:fs');
const tar = require('tar-stream');
const zlib = require('zlib');

module.exports = {
  compress
};

function addTarEntry(pack, options, data = null) {
  return new Promise((resolve, reject) => {
    pack.entry(options, data, (err) => {
      if (err) {
        console.log('err', err);
        reject(err);
      }

      resolve();
    });
  });
}

async function compress(apos, filepath, data) {
  const output = createWriteStream(filepath);
  const pack = tar.pack();
  const gzip = zlib.createGzip();

  pack.pipe(gzip).pipe(output);

  for (const [ filename, content ] of Object.entries(data.json || {})) {
    await addTarEntry(pack, { name: filename }, content);
  }

  const response = await compressAttachments(apos, pack, data.attachments || {});
  pack.finalize();

  return response;
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
