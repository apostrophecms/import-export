const gzip = require('./gzip');
const csv = require('./csv');
const xlsx = require('./xlsx');

// Keep gzip at the top of the list so it's the default format
module.exports = {
  gzip,
  csv,
  xlsx // TODO: make it a separate module to register the XLSX format, and make formats registerable: import-export-xlsx
};
