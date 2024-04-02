const fs = require('node:fs');
const fsp = require('node:fs/promises');
const zlib = require('node:zlib');
const tar = require('tar-stream');
const stream = require('node:stream/promises');
const Promise = require('bluebird');
const { EJSON } = require('bson');

module.exports = {
  label: 'gzip',
  extension: '.tar.gz',
  allowedExtension: '.gz',
  allowedTypes: [
    'application/gzip',
    'application/x-gzip'
  ],
  includeAttachments: true,
  importVersions: [ 'draft', 'published' ],
  exportVersions: [ 'draft', 'published' ],
  input,
  output,
  formatData(docs, attachments = [], attachmentsUrls = {}) {
    return {
      json: {
        'aposDocs.json': EJSON.stringify(docs, undefined, 2),
        'aposAttachments.json': EJSON.stringify(attachments, undefined, 2)
      },
      attachments: attachmentsUrls
    };
  }
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

  const copyOut = Promise.promisify(apos.attachment.uploadfs.copyOut);

  await addTarEntry(pack, {
    name: 'attachments/',
    type: 'directory'
  });

  let attachmentError = false;

  await Promise.map(Object.entries(attachments), processOneAttachment, {
    concurrency: 5
  });

  return { attachmentError };

  async function processOneAttachment([ name, url ]) {
    const temp = apos.attachment.uploadfs.getTempPath() + '/' + apos.util.generateId();
    try {
      await copyOut(url, temp);
      const size = fs.statSync(temp).size;
      // Looking at the source code, the tar-stream module
      // probably doesn't protect against two input streams
      // pushing mishmashed bytes into the tarball at the
      // same time, so stream in just one at a time. We still
      // get good concurrency on copyOut which is much slower
      // than this operation
      await apos.lock.withLock('import-export-copy-out', async () => {
        const fileStream = fs.createReadStream(temp);
        // Use the stream-based API
        const entryStream = pack.entry({
          name: `attachments/${name}`,
          size
        });
        await stream.pipeline([ fileStream, entryStream ]);
      });
    } catch (e) {
      attachmentError = true;
      apos.util.error(e);
    } finally {
      if (fs.existsSync(temp)) {
        fs.unlinkSync(temp);
      }
    }
  }
}
