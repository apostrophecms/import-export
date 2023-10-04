<div align="center">
  <img src="https://raw.githubusercontent.com/apostrophecms/apostrophe/main/logo.svg" alt="ApostropheCMS logo" width="80" height="80">

  <h1>Apostrophe Import Export Module</h1>
  <p>
    <a aria-label="Apostrophe logo" href="https://v3.docs.apostrophecms.org">
      <img src="https://img.shields.io/badge/MADE%20FOR%20Apostrophe%203-000000.svg?style=for-the-badge&logo=Apostrophe&labelColor=6516dd">
    </a>
    <a aria-label="Test status" href="https://github.com/apostrophecms/apostrophe/actions">
      <img alt="GitHub Workflow Status (branch)" src="https://img.shields.io/github/workflow/status/apostrophecms/apostrophe/Tests/main?label=Tests&labelColor=000000&style=for-the-badge">
    </a>
    <a aria-label="Join the community on Discord" href="http://chat.apostrophecms.org">
      <img alt="" src="https://img.shields.io/discord/517772094482677790?color=5865f2&label=Join%20the%20Discord&logo=discord&logoColor=fff&labelColor=000&style=for-the-badge&logoWidth=20">
    </a>
    <a aria-label="License" href="https://github.com/apostrophecms/import-export/blob/main/LICENSE.md">
      <img alt="" src="https://img.shields.io/static/v1?style=for-the-badge&labelColor=000000&label=License&message=MIT&color=3DA639">
    </a>
  </p>
</div>

This module enables import and export pages and pieces with or without 
their relationships a well as their associated files and images within A3 projects.

## Installation

To install the module, use the command line to run this command in an Apostrophe project's root directory:

```
npm install @apostrophecms/import-export
```

## Usage

Configure the module in the `app.js` file:

```javascript
require('apostrophe')({
  shortName: 'my-project',
  modules: {
    '@apostrophecms/import-export': {}
  }
});
```

### Options

You can disable the export and/or the import for certain pieces this way:

```javascript
module.exports = {
  extends: '@apostrophecms/piece-type'
  options: {
    importExport: {
      import: false,
      export: false
    }
  }
}
```

### Export

You can export documents from batch operations as well as from context operations. 
Pages can only be exported from context operations since they don't support batch operations.
Currenlty it only exports the `.tar.gz` format.


### Import

You can import **pieces** and **pages** from utility operations.

:warning: You must import the compressed file (`.tar.gz`) 
as it has been exported without modifying it, or the import might not go as planned.

