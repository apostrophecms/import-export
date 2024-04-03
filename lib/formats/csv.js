const fs = require('node:fs');
const { stringify } = require('csv-stringify');
// const parse = require('csv-parse');

module.exports = {
  label: 'CSV',
  extension: '.csv',
  allowedExtension: '.csv',
  allowedTypes: [ 'text/csv' ],
  includeAttachments: false,
  importVersions: [ 'draft' ],
  exportVersions: [ 'published' ],
  input,
  output,
  formatData(docs) {
    return docs;
  }
};

async function input(filepath) {
  // TODO:
  // return parse({
  //   columns: true,
  //   bom: true
  // });
};

async function output(apos, filepath, data) {
  const stream = fs.createWriteStream(filepath);
  const stringifier = stringify({
    header: true,
    columns: getColumnsNames(data)
  });

  stringifier.pipe(stream);

  // plunge each doc into the stream
  data.forEach(record => {
    stringifier.write(record);
  });

  stringifier.end();

  return new Promise((resolve, reject) => {
    stringifier.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);
  });
}

function getColumnsNames(data) {
  const columns = new Set();
  data.forEach(doc => {
    Object.keys(doc).forEach(key => columns.add(key));
  });
  return Array.from(columns);
}
