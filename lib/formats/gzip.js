const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const stream = require('node:stream/promises');
const zlib = require('node:zlib');
const tar = require('tar-stream');
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
  // importVersions: [ 'draft', 'published' ],
  // exportVersions: [ 'draft', 'published' ],
  async import(exportPath, { docIds } = {}) {
    console.log('🚀 ~ import ~ exportPath:', exportPath);
    console.log('🚀 ~ import ~ docIds:', docIds);
    console.log('this.allowedExtension', this.allowedExtension);
    // If the given path is actually the archive, we first need to extract it.
    // Then we no longer need the archive file, so we remove it.
    if (exportPath.endsWith(this.allowedExtension)) {
      const filepath = exportPath;
      exportPath = exportPath.replace(this.allowedExtension, '');
      await extract(filepath, exportPath);
      await remove(filepath);

    }
    console.log('🚀 ~ import ~ exportPath:', exportPath);

    const docs = await fsp.readFile(path.join(exportPath, 'aposDocs.json'));
    const attachments = await fsp.readFile(path.join(exportPath, 'aposAttachments.json'));
    console.log('IMPORT RETURNS:');
    console.dir({
      docs: !docIds
        ? EJSON.parse(docs)
        : EJSON.parse(docs).filter(({ aposDocId }) => docIds.includes(aposDocId)),
      attachmentsInfo: EJSON.parse(attachments).map((attachment) => ({
        attachment,
        file: {
          name: `${attachment.name}.${attachment.extension}`,
          path: path.join(
            exportPath,
            'attachments',
            `${attachment._id}-${attachment.name}.${attachment.extension}`
          )
        }
      })),
      exportPath
    }, { depth: 9 });

    return {
      docs: !docIds
        ? EJSON.parse(docs)
        : EJSON.parse(docs).filter(({ aposDocId }) => docIds.includes(aposDocId)),
      attachmentsInfo: EJSON.parse(attachments).map((attachment) => ({
        attachment,
        file: {
          name: `${attachment.name}.${attachment.extension}`,
          path: path.join(
            exportPath,
            'attachments',
            `${attachment._id}-${attachment.name}.${attachment.extension}`
          )
        }
      })),
      exportPath
    };
  },
  async export(
    filepath,
    {
      docs,
      attachments = [],
      attachmentUrls = {}
    },
    processAttachments
  ) {
    const data = {
      json: {
        'aposDocs.json': EJSON.stringify(docs, undefined, 2),
        'aposAttachments.json': EJSON.stringify(attachments, undefined, 2)
      },
      attachments: attachmentUrls
    };

    const writeStream = fs.createWriteStream(filepath);
    const pack = tar.pack();
    const gzip = zlib.createGzip();

    pack
      .pipe(gzip)
      .pipe(writeStream);

    let result;

    return new Promise((resolve, reject) => {
      writeStream.on('error', reject);
      gzip.on('error', reject);
      pack.on('error', reject);

      writeStream.on('finish', () => {
        resolve(result);
      });

      for (const [ filename, content ] of Object.entries(data.json || {})) {
        addTarEntry(pack, { name: filename }, content).catch(reject);
      }

      addTarEntry(pack, {
        name: 'attachments/',
        type: 'directory'
      })
        .then(() => {
          console.log('attachments');
          processAttachments(data.attachments, async (temp, name, size) => {
            console.log('callback', { temp, name, size });
            const readStream = fs.createReadStream(temp);
            const entryStream = pack.entry({
              name: `attachments/${name}`,
              size
            });

            await stream.pipeline([ readStream, entryStream ]);
          })
            .then((res) => {
              result = res;
              pack.finalize();
            });
        })
        .catch(reject);
    });
  }
};

async function extract(filepath, exportPath) {
  console.log('🚀 ~ extract ~ filepath:', filepath);
  console.log('🚀 ~ extract ~ exportPath:', exportPath);

  if (!fs.existsSync(exportPath)) {
    await fsp.mkdir(exportPath);
  }

  const readStream = fs.createReadStream(filepath);
  const gunzip = zlib.createGunzip();
  const extract = tar.extract();

  readStream
    .pipe(gunzip)
    .pipe(extract);

  return new Promise((resolve, reject) => {
    readStream.on('error', reject);
    gunzip.on('error', reject);
    extract.on('error', reject);

    extract.on('entry', (header, stream, next) => {
      if (header.type === 'directory') {
        fsp
          .mkdir(path.join(exportPath, header.name))
          .then(next)
          .catch(reject);
      } else {
        stream.pipe(fs.WriteStream(path.join(exportPath, header.name)));
        stream.on('end', next);
      }
    });
    extract.on('finish', resolve);
  });
}

async function remove(filepath) {
  console.log('🚀 ~ remove ~ filepath:', filepath);
  try {
    await fsp.unlink(filepath);
  } catch (error) {
    self.apos.util.error(error);
  }
}

function addTarEntry(pack, options, data = null) {
  return new Promise((resolve, reject) => {
    pack.entry(options, data, error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
