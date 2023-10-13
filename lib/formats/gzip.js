const fs = require('node:fs');
const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const tar = require('tar-stream');

module.exports = {
  label: 'gzip',
  extension: '.tar.gz',
  allowedExtension: '.gz',
  allowedTypes: [
    'application/gzip',
    'application/x-gzip'
  ],
  input,
  output
};

async function input(filepath) {
  const extractPath = filepath.replace(this.allowedExtension, '');

  if (!fs.existsSync(extractPath)) {
    await fsp.mkdir(extractPath);
  }

  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(filepath);
    const gunzip = zlib.createGunzip();
    const extract = tar.extract();

    input.on('error', reject);
    gunzip.on('error', reject);

    extract
      .on('entry', (header, stream, next) => {
        if (header.type === 'directory') {
          fsp
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
      .pipe(gunzip)
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

  const copyOut = require('util').promisify(apos.attachment.uploadfs.copyOut);

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
    return Object.entries(attachments).map(([ name, url ]) => async {
      console.log(`** ${url}`);

      const p = new Promise((resolve, reject) => async {
        await apos.attachment.uploadfs.copyOut(url, temp);
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
      return new Promise((resolve, reject) => {
        return p.then(resolve).catch(e => {
          console.error(`Error for ${url} is:`, e);
          return reject(e);
        });
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
