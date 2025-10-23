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

describe('#overrideDuplicates - overriding locales integration tests', function() {
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

    this.beforeEach(async function () {
      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
      await insertPiecesAndPages(apos);
      await cleanFixtures(apos);
      await copyFixtures(apos);
      await buildFixtures(apos);
    });

    it.only('should not rewrite the docs locale when the locale is the same', async function() {
      const req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip'
        }
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'draft' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:draft',
        title: 'topic1 EXISTING DRAFT'
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:published',
        title: 'topic1 EXISTING PUBLISHED'
      });

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
              path: path.join(apos.rootDir, 'data/tmp/uploads/topic-draft.tar.gz'),
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
          _id: topics.at(0).aposDocId.concat(':en:draft'),
          aposLocale: 'en:draft',
          aposMode: 'draft',
          modified: true,
          title: 'topic1'
        },
        {
          ...topics.at(1),
          _id: topics.at(1).aposDocId.concat(':en:published'),
          aposLocale: 'en:published',
          aposMode: 'published',
          title: 'topic1'
        }
      ];

      assert.deepEqual(actual, expected);
    });

    it('should rewrite the docs locale when the locale is different', async function() {
      const req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip'
        }
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'draft' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:draft',
        title: 'topic1 EXISTING DRAFT'
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:published',
        title: 'topic1 EXISTING PUBLISHED'
      });

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
          __originalLocale: 'fr',
          _id: topics.at(0).aposDocId.concat(':en:draft'),
          aposMode: 'draft',
          aposLocale: 'en:draft',
          title: 'topic1',
          type: 'topic'
        },
        {
          ...topics.at(1),
          _id: topics.at(1).aposDocId.concat(':en:published'),
          aposMode: 'published',
          aposLocale: 'en:published',
          title: 'topic1 EXISTING PUBLISHED',
          type: 'topic'
        }
      ];

      assert.deepEqual(actual, expected);
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
          },
          '@apostrophecms/page': {
            options: {
              park: [
                {
                  parkedId: 'search-parked',
                  slug: '/search',
                  title: 'Search',
                  type: '@apostrophecms/search'
                }
              ]
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

    this.beforeEach(async function () {
      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
      await insertPiecesAndPages(apos);
      await cleanFixtures(apos);
      await copyFixtures(apos);
      await buildFixtures(apos);
    });

    it('should check if documents to import have duplicates in the current locale', async function() {
      const req = apos.task.getReq({ mode: 'draft' });
      const frReq = apos.task.getReq({
        locale: 'fr',
        mode: 'draft'
      });
      const [ nonLocalized ] = await apos.doc.db.find({ title: 'nonLocalized1' }).toArray();
      const enArticles = await apos.article.find(req).toArray();
      const parkedPages = await apos.page
        .find(req, { parkedId: { $exists: true } })
        .toArray();
      const singleton = await apos.global.findGlobal(req);

      const failedIds = [];
      const reporting = { failure: () => {} };
      const enDocs = enArticles.concat([ nonLocalized, singleton ]).concat(parkedPages);
      const enDuplicates = await importExportManager.checkDuplicates(req, {
        reporting,
        docs: enDocs,
        failedIds,
        failedLog: {}
      });

      const frDocs = enDocs.map((doc) => {
        return {
          ...doc,
          _id: doc._id.replace('en', 'fr'),
          aposLocale: 'fr:draft'
        };
      });
      const frDuplicates = await importExportManager.checkDuplicates(frReq, {
        reporting,
        docs: frDocs,
        failedIds,
        failedLog: {}
      });

      const actual = {
        enDuplicates: [
          enDocs.every((doc) => enDuplicates.duplicatedIds.has(doc.aposDocId)),
          enDuplicates.duplicatedDocs.length,
          enDuplicates.duplicatedDocs.filter(doc => !!doc.replaceId).length
        ],
        frDuplicates: [
          frDocs.every((doc) => frDuplicates.duplicatedIds.has(doc.aposDocId)),
          frDuplicates.duplicatedIds.has(nonLocalized.aposDocId),
          frDuplicates.duplicatedDocs.length,
          enDuplicates.duplicatedDocs.filter(doc => !!doc.replaceId).length
        ]
      };
      const expected = {
        enDuplicates: [ true, 6, 3 ],
        frDuplicates: [ false, true, 4, 3 ]
      };

      assert.deepEqual(actual, expected);
    });

    it('should not rewrite the docs locale when the locale is the same', async function() {
      const req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip'
        }
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'draft' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:draft',
        title: 'topic1 EXISTING DRAFT'
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:published',
        title: 'topic1 EXISTING PUBLISHED'
      });

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
              path: path.join(apos.rootDir, 'data/tmp/uploads/topic-draft.tar.gz'),
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
          _id: topics.at(0).aposDocId.concat(':en:draft'),
          aposLocale: 'en:draft',
          aposMode: 'draft',
          modified: true,
          title: 'topic1 PUBLISHED'
        },
        {
          ...topics.at(1),
          _id: topics.at(1).aposDocId.concat(':en:published'),
          aposLocale: 'en:published',
          aposMode: 'published',
          title: 'topic1 EXISTING PUBLISHED'
        }
      ];

      assert.deepEqual(actual, expected);
    });

    it('should rewrite the docs locale when the locale is different and the `overrideLocale` param is provided', async function() {
      const req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip'
        }
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'draft' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:draft',
        title: 'topic1 EXISTING DRAFT'
      });

      await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
        ...apos.topic.newInstance(),
        _id: '4:en:published',
        title: 'topic1 EXISTING PUBLISHED'
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
              path: path.join(apos.rootDir, 'data/tmp/uploads/fr-topic-draft.tar.gz'),
              type: importExportManager.formats.gzip.allowedTypes[0]
            }
          }
        })
      );

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
          __originalLocale: 'fr',
          _id: topics.at(0).aposDocId.concat(':en:draft'),
          aposLocale: 'en:draft',
          aposMode: 'draft',
          modified: true,
          title: 'topic1'
        },
        {
          ...topics.at(1),
          __originalLocale: 'fr',
          _id: topics.at(1).aposDocId.concat(':en:published'),
          aposLocale: 'en:published',
          aposMode: 'published',
          title: 'topic1'
        }
      ];

      assert.deepEqual(actual, expected);
    });
  });
});
