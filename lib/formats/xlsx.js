const XLSX = require('xlsx');

const SHEET_NAME = 'docs';

module.exports = {
  label: 'XLSX',
  extension: '.xlsx',
  allowedExtension: '.xlsx',
  allowedTypes: [ 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ],
  includeAttachments: false,
  async import(filepath) {
    const workbook = XLSX.readFile(filepath);

    const sheet = workbook.Sheets[SHEET_NAME];
    const docs = XLSX.utils.sheet_to_json(sheet);

    // TODO: handle dates, numbers and floats, and objects and arrays
    console.log('🚀 ~ import ~ docs:', docs);

    return { docs };
  },
  async export(filepath, { docs }) {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(docs);

    XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
    XLSX.writeFile(workbook, filepath);

    console.info(`[xlsx] docs and attachments written to ${filepath}`);
  }
};
