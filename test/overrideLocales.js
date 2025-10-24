const assert = require('node:assert/strict');
const path = require('node:path');
const t = require('apostrophe/test-lib/util.js');
const {
  getAppConfig,
  insertAdminUser,
  insertPiecesAndPages,
  deletePiecesAndPages,
  deleteAttachments,
  buildFixtures,
  copyFixtures,
  cleanFixtures
} = require('./util/index.js');

describe('#import - overriding locales integration tests', function() {
  this.timeout(t.timeout);

  let apos;
  let importExportManager;
  let attachmentPath;

  describe('when the site has only one locale', function() {
    before(async function() {
      apos = await t.create({
        root: module,
        testModule: true,
        modules: getAppConfig()
      });

      attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
      importExportManager = apos.modules['@apostrophecms/import-export'];

      await insertAdminUser(apos);
    });

    after(async function() {
      await t.destroy(apos);
    });

    this.beforeEach(async function() {
      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
      await insertPiecesAndPages(apos);
      await cleanFixtures(apos);
      await copyFixtures(apos);
      await buildFixtures(apos);
    });

    it('should import pieces with related documents from the extracted export path when provided', async function() {
      // Since we are mocking this and not really uploading a file, we have to
      // manually call setExportId to establish a mapping to a safe
      // unique identifier to share with the "browser"
      const expectedPath = '/custom/extracted-export-path';
      await importExportManager.setExportId(expectedPath);

      const req = apos.task.getReq({
        locale: 'en',
        body: {
          exportId: await importExportManager.getExportId(expectedPath),
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

      const results = await importExportManager.import(req);

      const actual = results;
      const expected = {};

      assert.deepEqual(actual, expected);
    });

    // FIX
    it('should not rewrite the docs locale nor ask about it when the locale is the same', async function() {
      const req = apos.task.getReq({
        locale: 'en',
        body: {},
        files: {
          file: {
            path: path.join(apos.rootDir, 'data/tmp/uploads/topic-draft.tar.gz'),
            type: importExportManager.formats.gzip.allowedTypes[0]
          }
        }
      });
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
      const req = apos.task.getReq({
        locale: 'fr',
        body: {},
        files: {
          file: {
            path: path.join(apos.rootDir, 'data/tmp/uploads/fr-topic-draft.tar.gz'),
            type: importExportManager.formats.gzip.allowedTypes[0]
          }
        }
      });
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

      attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
      importExportManager = apos.modules['@apostrophecms/import-export'];

      await insertAdminUser(apos);
    });

    after(async function() {
      await t.destroy(apos);
    });

    this.beforeEach(async function() {
      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
      // await insertPiecesAndPages(apos);
      await cleanFixtures(apos);
      await copyFixtures(apos);
      await buildFixtures(apos);
    });

    it.only('should not rewrite the docs locale nor ask about it when the locale is the same', async function() {
      const req = apos.task.getReq({
        locale: 'fr',
        body: {}
      });

      await apos.topic.insert(
        apos.task.getReq({
          locale: 'fr',
          mode: 'draft'
        }),
        {
          ...apos.topic.newInstance(),
          _id: '4:fr:draft',
          slug: 'topic1-fr-existing-draft',
          title: 'topic1 FR EXISTING DRAFT'
        }
      );

      await apos.topic.insert(
        apos.task.getReq({
          locale: 'fr',
          mode: 'published'
        }),
        {
          ...apos.topic.newInstance(),
          _id: '4:fr:published',
          slug: 'topic1-fr-existing-published',
          title: 'topic1 FR EXISTING PUBLISHED'
        }
      );

      const {
        duplicatedDocs,
        importedAttachments,
        exportId,
        jobId,
        notificationId,
        formatLabel
      } = await importExportManager.import(
        req.clone({
          files: {
            file: {
              path: path.join(apos.rootDir, 'data/tmp/uploads/fr-topic-draft.tar.gz'),
              type: importExportManager.formats.gzip.allowedTypes[0]
            }
          }
        })
      );

      const _req = req.clone({
        body: {
          ...req.body,
          docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
          duplicatedDocs,
          importedAttachments,
          exportId,
          jobId,
          notificationId,
          formatLabel
        }
      });

      await importExportManager.overrideDuplicates(_req);

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      const actual = topics;
      const expected = [
        {
          ...topics.at(0),
          _id: topics.at(0).aposDocId.concat(':fr:draft'),
          aposLocale: 'fr:draft',
          aposMode: 'draft',
          modified: true,
          slug: 'topic1-fr',
          title: 'topic1 FR'
        },
        {
          ...topics.at(1),
          _id: topics.at(1).aposDocId.concat(':fr:published'),
          aposLocale: 'fr:published',
          aposMode: 'published',
          slug: 'topic1-fr-existing-published',
          title: 'topic1 FR EXISTING PUBLISHED'
        }
      ];

      assert.deepEqual(actual, expected);
    });

    it.only('should not rewrite the docs locales nor insert them but ask about it when the locale is different', async function() {
      const req = apos.task.getReq({
        locale: 'fr',
        body: {}
      });

      const {
        exportId,
        formatLabel,
        importDraftsOnly,
        translate
      } = await importExportManager.import(
        req.clone({
          files: {
            file: {
              path: path.join(apos.rootDir, 'data/tmp/uploads/topic-draft.tar.gz'),
              type: importExportManager.formats.gzip.allowedTypes[0]
            }
          }
        })
      );

      // TODO: check notification name
      // apos.notify = async (req, message, options) => {
      //   assert.equal(options.event.name, 'import-export-import-locale-differs');
      // };

      const {
        duplicatedDocs,
        importedAttachments,
        jobId,
        notificationId
      } = await importExportManager.import(
        req.clone({
          body: {
            ...req.body,
            importDraftsOnly,
            translate,
            overrideLocale: true,
            exportId,
            formatLabel
          }
        })
      );

      const _req = req.clone({
        body: {
          ...req.body,
          docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
          duplicatedDocs,
          importedAttachments,
          exportId,
          jobId,
          notificationId,
          formatLabel
        }
      });

      await importExportManager.overrideDuplicates(_req);

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      const actual = topics;
      const expected = [
        {
          ...topics.at(0),
          _id: topics.at(0).aposDocId.concat(':fr:draft'),
          aposLocale: 'fr:draft',
          aposMode: 'draft',
          modified: true,
          slug: 'topic1-fr',
          title: 'topic1 FR'
        },
        {
          ...topics.at(1),
          _id: topics.at(1).aposDocId.concat(':fr:published'),
          aposLocale: 'fr:published',
          aposMode: 'published',
          slug: 'topic1-fr-existing-published',
          title: 'topic1 FR EXISTING PUBLISHED'
        }
      ];

      assert.deepEqual(actual, expected);
    });

    it('should rewrite the docs locale when the locale is different and the `overrideLocale` param is provided', async function() {
      // Since we are mocking this and not really uploading a file, we have to
      // manually call setExportId to establish a mapping to a safe
      // unique identifier to share with the "browser"
      const expectedPath = '/custom/extracted-export-path';
      await importExportManager.setExportId(expectedPath);

      const req = apos.task.getReq({
        locale: 'en',
        body: {
          exportId: await importExportManager.getExportId(expectedPath),
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
