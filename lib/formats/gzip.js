const path = require('path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const tar = require('tar-stream');

module.exports = {
  label: 'gzip',
  extension: 'tgz',
  input,
  output
};

async function input(exportPath, fileName) {
  const zipPath = path.join(exportPath, fileName);
  const extractPath = path.join(exportPath, fileName.replace('.tgz', ''));

  if (!fs.existsSync(extractPath)) {
    await fs.mkdir(extractPath);
  }

  return new Promise((resolve, reject) => {
    const extract = tar.extract();
    const input = fs.createReadStream(zipPath);
    const unzip = zlib.createGunzip();

    unzip.on('error', reject);

    extract
      .on('entry', (header, stream, next) => {
        if (header.type === 'directory') {
          fs
            .mkdir(`${extractPath}/${header.name}`)
            .then(next)
            .catch(reject);
        } else {
          stream.pipe(fs.WriteStream(`${extractPath}/${header.name}`));

          stream.on('end', next);
        }
      })
      .on('finish', () => {
        resolve(extractPath);
      })
      .on('error', reject);

    input
      .pipe(unzip)
      .pipe(extract);
  });
};

async function output(apos, filepath, data) {
  return new Promise((resolve, reject) => {
    let result;
    const output = fs.createWriteStream(filepath);
    const pack = tar.pack();
    const gzip = zlib.createGzip();

    gzip.on('error', reject);

    output
      .on('error', reject)
      .on('finish', () => {
        resolve(result);
      });

    pack
      .pipe(gzip)
      .pipe(output);

    for (const [ filename, content ] of Object.entries(data.json || {})) {
      addTarEntry(pack, { name: filename }, content).catch(reject);
    }

    compressAttachments(apos, pack, data.attachments || {})
      .then((res) => {
        result = res;
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

            res
              .buffer()
              .then((buffer) => {
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
