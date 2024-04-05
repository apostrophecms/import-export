const fs = require('node:fs');
const { stringify } = require('csv-stringify');
const { parse } = require('csv-parse');

module.exports = {
  label: 'CSV',
  extension: '.csv',
  allowedExtension: '.csv',
  allowedTypes: [ 'text/csv' ],
  includeAttachments: false,
  // TODO: remove these? because it really messes with the duplicated docs detection system
  // importVersions: [ 'draft' ],
  // exportVersions: [ 'published' ],
  async import(exportPath) {
    const reader = fs.createReadStream(exportPath);
    const parser = reader
      .pipe(
        parse({
          columns: true,
          bom: true,
          cast(value, context) {
            if (context.header) {
              return value;
            }

            // console.log(context.column, value, typeof value);
            // TODO: need to handle Dates, number and floats?

            try {
              return JSON.parse(value);
            } catch {
              return value;
            }
          }
        })
      );

    const docs = [];

    parser.on('readable', function() {
      let doc;
      while ((doc = parser.read()) !== null) {
        docs.push(doc);
      }
    });

    return new Promise((resolve, reject) => {
      reader.on('error', reject);
      parser.on('error', reject);
      parser.on('end', () => {
        resolve({
          docs: !docIds
            ? docs
            : docs.filter(({ aposDocId }) => docIds.includes(aposDocId))
        });
      });
    });
  },
  async export(filepath, { docs }) {
    const writer = fs.createWriteStream(filepath);
    const stringifier = stringify({
      header: true,
      columns: getColumnsNames(docs),
      // quoted_string: true,
      cast: {
        date(value) {
          return value.toISOString();
        }
      }
    });

    stringifier.pipe(writer);

    // plunge each doc into the stream
    docs.forEach(record => {
      stringifier.write(record);
    });

    stringifier.end();

    return new Promise((resolve, reject) => {
      stringifier.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', resolve);
    });
  }
};

function getColumnsNames(docs) {
  const columns = new Set();
  docs.forEach(doc => {
    Object.keys(doc).forEach(key => columns.add(key));
  });
  return Array.from(columns);
}
