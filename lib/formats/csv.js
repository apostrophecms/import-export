const fs = require('node:fs');
const { stringify } = require('csv-stringify');
const parse = require('csv-parse');

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
  console.log('data');
  console.dir(data, { depth: 9 });

  return new Promise((resolve, reject) => {
    const result = [];
    const stringifier = stringify({
      header: true,
      columns: getColumnsNames(data)
    });

    stringifier.on('readable', function() {
      let row;
      while ((row = stringifier.read()) !== null) {
        result.push(row);
      }
    });

    stringifier.on('error', reject);

    stringifier.on('finish', function() {
      console.log('result');
      console.dir(result);
      resolve(result);
    });

    stringifier.pipe(fs.createWriteStream(filepath));

    data.forEach(record => {
      stringifier.write(record);
    });

    stringifier.end();
  });
}

function getColumnsNames(data) {
  const columns = new Set();
  data.forEach(doc => {
    Object.keys(doc).forEach(key => columns.add(key));
  });
  return Array.from(columns);
}
