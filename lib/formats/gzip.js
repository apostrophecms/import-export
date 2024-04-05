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
  async import(filepath) {
    const extractPath = filepath.replace(this.allowedExtension, '');

    if (!fs.existsSync(extractPath)) {
      await fsp.mkdir(extractPath);
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
            .mkdir(`${extractPath}/${header.name}`)
            .then(next)
            .catch(reject);
        } else {
          stream.pipe(fs.WriteStream(`${extractPath}/${header.name}`));
          stream.on('end', next);
        }
      });

      extract.on('finish', () => {
        resolve(extractPath);
      });
    });
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
  },
  async read(exportPath, docIds) {
    const docs = await fsp.readFile(path.join(exportPath, 'aposDocs.json'));
    const attachments = await fsp.readFile(path.join(exportPath, 'aposAttachments.json'));

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
      }))
    };
  }
};

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
