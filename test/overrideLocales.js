const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const path = require('path');
const {
  getAppConfig,
  insertAdminUser,
  insertPiecesAndPages,
  deletePiecesAndPages,
  deleteAttachments
} = require('./util');

describe('#import - overriding locales integration tests', function() {
  this.timeout(t.timeout);

  let apos;
  let req;
  let notify;
  let input;
  let rewriteDocsWithCurrentLocale;
  let insertDocs;
  let mimeType;
  let gzip;
  let importExportManager;
  let attachmentPath;

  describe('when the site has only one locale', function() {
    this.beforeEach(async function() {
      req = apos.task.getReq({
        locale: 'en',
        body: {},
        files: {
          file: {
            path: '/some/path/to/file',
            type: mimeType
          }
        }
      });
      notify = apos.notify;
      input = gzip.input;
      rewriteDocsWithCurrentLocale = apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale;
      insertDocs = apos.modules['@apostrophecms/import-export'].insertDocs;

      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
    });

    this.afterEach(function() {
      apos.notify = notify;
      gzip.input = input;
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = rewriteDocsWithCurrentLocale;
      apos.modules['@apostrophecms/import-export'].insertDocs = insertDocs;
    });

    before(async function() {
      apos = await t.create({
        root: module,
        testModule: true,
        modules: getAppConfig()
      });

      attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
      importExportManager = apos.modules['@apostrophecms/import-export'];
      importExportManager.removeFromUploadFs = () => {};
      importExportManager.remove = () => {};
      gzip = importExportManager.formats.gzip;
      mimeType = gzip.allowedTypes[0];

      await insertAdminUser(apos);
    });

    after(async function() {
      await t.destroy(apos);
    });

    it('should import pieces with related documents from the extracted export path when provided', async function() {
      // Since we are mocking this and not really uploading a file, we have to
      // manually call setExportPathId to establish a mapping to a safe
      // unique identifier to share with the "browser"
      const expectedPath = '/custom/extracted-export-path';
      await importExportManager.setExportPathId(expectedPath);

      req = apos.task.getReq({
        locale: 'en',
        body: {
          exportPathId: await importExportManager.getExportPathId(expectedPath),
          formatLabel: 'gzip',
          overrideLocale: true
        }
      });

      gzip.input = async exportPath => {
        assert.equal(exportPath, expectedPath);

        return {
          docs: [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };

      await importExportManager.import(req);
    });

    // FIX
    it('should not rewrite the docs locale nor ask about it when the locale is not different', async function() {
      gzip.input = async () => {
        return {
          docs: [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = (req, docs) => {
        throw new Error('rewriteDocsWithCurrentLocale should not have been called');
      };
      apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs }) => {
        assert.deepEqual(docs, [
          {
            _id: '4:en:draft',
            aposMode: 'draft',
            aposLocale: 'en:draft',
            title: 'topic1',
            type: 'topic'
          }
        ]);

        return [];
      };
      apos.notify = async (req, message, options) => {
        if (options?.event?.name === 'import-export-import-locale-differs') {
          throw new Error('notify should not have been called with event "import-locale-differ"');
        }
        return {};
      };

      await importExportManager.import(req);
    });

    // FIX
    it('should rewrite the docs locale without asking about it when the locale is different', async function() {
      gzip.input = async () => {
        return {
          docs: [
            {
              _id: '4:fr:draft',
              aposMode: 'draft',
              aposLocale: 'fr:draft',
              title: 'topic1',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = (req, docs) => {
        assert.deepEqual(docs, [
          {
            _id: '4:fr:draft',
            aposMode: 'draft',
            aposLocale: 'fr:draft',
            title: 'topic1',
            type: 'topic'
          }
        ]);

        return rewriteDocsWithCurrentLocale(req, docs);
      };
      apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs }) => {
        assert.deepEqual(docs, [
          {
            _id: '4:en:draft',
            aposMode: 'draft',
            aposLocale: 'en:draft',
            title: 'topic1',
            type: 'topic',
            __originalLocale: 'fr'
          }
        ]);

        return {
          duplicatedDocs: [],
          duplicatedIds: [],
          failedIds: []
        };
      };
      apos.notify = async (req, message, options) => {
        if (options?.event?.name === 'import-export-import-locale-differs') {
          throw new Error('notify should not have been called with event "import-locale-differ"');
        }
        return {};
      };

      await importExportManager.import(req);
    });
  });

  describe('when the site has multiple locales', function() {
    let apos;
    let importExportManager;

    let req;
    let notify;
    let input;
    let rewriteDocsWithCurrentLocale;
    let insertDocs;

    after(async function() {
      await t.destroy(apos);
    });

    before(async function() {
      apos = await t.create({
        root: module,
        testModule: true,
        modules: getAppConfig({
          '@apostrophecms/express': {
            options: {
              session: { secret: 'supersecret' }
            }
          },
          '@apostrophecms/i18n': {
            options: {
              defaultLocale: 'en',
              locales: {
                en: { label: 'English' },
                fr: {
                  label: 'French',
                  prefix: '/fr'
                }
              }
            }
          }
        })
      });

      importExportManager = apos.modules['@apostrophecms/import-export'];
      importExportManager.removeExportFileFromUploadFs = () => {};
      importExportManager.remove = () => {};

      await insertAdminUser(apos);
      await insertPiecesAndPages(apos);
    });

    this.beforeEach(async function() {
      req = apos.task.getReq({
        locale: 'en',
        body: {},
        files: {
          file: {
            path: '/some/path/to/file',
            type: mimeType
          }
        }
      });
      notify = apos.notify;
      input = gzip.input;
      rewriteDocsWithCurrentLocale = apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale;
      insertDocs = apos.modules['@apostrophecms/import-export'].insertDocs;

      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
    });

    this.afterEach(function() {
      apos.notify = notify;
      gzip.input = input;
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = rewriteDocsWithCurrentLocale;
      apos.modules['@apostrophecms/import-export'].insertDocs = insertDocs;
    });

    it('should not rewrite the docs locale nor ask about it when the locale is not different', async function() {
      const req = apos.task.getReq({
        locale: 'fr',
        body: {},
        files: {
          file: {
            path: '/some/path/to/file',
            type: mimeType
          }
        }
      });

      gzip.input = async req => {
        return {
          docs: [
            {
              _id: '4:fr:draft',
              aposMode: 'draft',
              aposLocale: 'fr:draft',
              title: 'topic1',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = () => {
        throw new Error('rewriteDocsWithCurrentLocale should not have been called');
      };
      apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs }) => {
        assert.deepEqual(docs, [
          {
            _id: '4:fr:draft',
            aposMode: 'draft',
            aposLocale: 'fr:draft',
            title: 'topic1',
            type: 'topic'
          }
        ]);

        return {
          duplicatedDocs: [],
          duplicatedIds: [],
          failedIds: []
        };
      };
      apos.notify = async (req, message, options) => {
        if (options?.event?.name === 'import-export-import-locale-differs') {
          throw new Error('notify should not have been called with event "import-locale-differ"');
        }
        return {};
      };

      await importExportManager.import(req);
    });

    it('should not rewrite the docs locales nor insert them but ask about it when the locale is different', async function() {
      gzip.input = async req => {
        return {
          docs: [
            {
              _id: '4:fr:draft',
              aposMode: 'draft',
              aposLocale: 'fr:draft',
              title: 'topic1',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };

      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = () => {
        throw new Error('rewriteDocsWithCurrentLocale should not have been called');
      };
      apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
        throw new Error('insertDocs should not have been called');
      };
      apos.notify = async (req, message, options) => {
        assert.equal(options.event.name, 'import-export-import-locale-differs');
      };

      await importExportManager.import(req);
    });

    it('should rewrite the docs locale when the locale is different and the `overrideLocale` param is provided', async function() {
      // Since we are mocking this and not really uploading a file, we have to
      // manually call setExportPathId to establish a mapping to a safe
      // unique identifier to share with the "browser"
      const expectedPath = '/custom/extracted-export-path';
      await importExportManager.setExportPathId(expectedPath);

      const req = apos.task.getReq({
        locale: 'en',
        body: {
          exportPathId: await importExportManager.getExportPathId(expectedPath),
          formatLabel: 'gzip',
          overrideLocale: true
        }
      });

      gzip.input = async req => {
        return {
          docs: [
            {
              _id: '4:fr:draft',
              aposMode: 'draft',
              aposLocale: 'fr:draft',
              title: 'topic1',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };

      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = (req, docs) => {
        assert.deepEqual(docs, [
          {
            _id: '4:fr:draft',
            aposMode: 'draft',
            aposLocale: 'fr:draft',
            title: 'topic1',
            type: 'topic'
          }
        ]);

        return rewriteDocsWithCurrentLocale(req, docs);
      };
      apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs }) => {
        assert.deepEqual(docs, [
          {
            _id: '4:en:draft',
            aposMode: 'draft',
            aposLocale: 'en:draft',
            title: 'topic1',
            type: 'topic',
            __originalLocale: 'fr'
          }
        ]);

        return [];
      };
      apos.notify = async (req, message, options) => {
        if (options?.event?.name === 'import-export-import-locale-differs') {
          throw new Error('notify should not have been called with event "import-locale-differ"');
        }
        return {};
      };

      await importExportManager.import(req);
    });
  });
});
