const t = require('apostrophe/test-lib/util.js');
const path = require('path');
const assert = require('assert');
const {
  getAppConfig, insertAdminUser, insertPiecesAndPages, deletePiecesAndPages, deleteAttachments
} = require('./util');

describe('#overrideDuplicates - overriding locales integration tests', function() {
  let req;
  let input;
  let rewriteDocsWithCurrentLocale;
  let jobManager;
  let apos;
  let importExportManager;
  let attachmentPath;
  let gzip;

  describe('when the site has only one locale', function() {
    this.beforeEach(async function() {
      req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip'
        }
      });
      jobManager = apos.modules['@apostrophecms/job'];
      input = gzip.input;
      rewriteDocsWithCurrentLocale = apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale;

      jobManager.success = () => {};
      jobManager.failure = () => {};

      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
    });

    this.afterEach(function() {
      gzip.input = input;
      apos.modules['@apostrophecms/job'].jobManager = jobManager;
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = rewriteDocsWithCurrentLocale;
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

      await insertAdminUser(apos);
    });

    after(async function() {
      await t.destroy(apos);
    });

    it('should not rewrite the docs locale when the locale is not different', async function() {
      gzip.input = async exportPath => {
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

      await importExportManager.overrideDuplicates(req);
    });

    it('should rewrite the docs locale when the locale is different', async function() {
      gzip.input = async exportPath => {
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

      await importExportManager.overrideDuplicates(req);
    });
  });

  describe('when the site has multiple locales', function() {
    let apos;
    let importExportManager;

    let input;
    let rewriteDocsWithCurrentLocale;

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

      attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
      importExportManager = apos.modules['@apostrophecms/import-export'];
      importExportManager.removeFromUploadFs = () => {};
      importExportManager.remove = () => {};
      gzip = importExportManager.formats.gzip;

      importExportManager = apos.modules['@apostrophecms/import-export'];
      importExportManager.removeExportFileFromUploadFs = () => {};
      importExportManager.remove = () => {};

      await insertAdminUser(apos);
    });

    this.beforeEach(async function() {
      req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip'
        }
      });
      input = gzip.input;
      rewriteDocsWithCurrentLocale = apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale;

      jobManager = apos.modules['@apostrophecms/job'];
      jobManager.success = () => {};
      jobManager.failure = () => {};

      await insertPiecesAndPages(apos);
    });

    this.afterEach(async function() {
      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
      gzip.input = input;
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = rewriteDocsWithCurrentLocale;
    });

    it('should check if documents to import have duplicates in the current locale', async function() {
      const req = apos.task.getReq({ mode: 'draft' });
      const frReq = apos.task.getReq({
        locale: 'fr',
        mode: 'draft'
      });
      const [ user ] = await apos.doc.db.find({ slug: 'user-admin' }).toArray();
      const enArticles = await apos.article.find(req).toArray();

      const enDocs = enArticles.concat(user);
      const enDuplicates = await importExportManager.checkDuplicates(req, enDocs);

      const frDocs = enDocs.map((doc) => {
        return {
          ...doc,
          _id: doc._id.replace('en', 'fr'),
          aposLocale: 'fr:draft'
        };
      });
      const frDuplicates = await importExportManager.checkDuplicates(frReq, frDocs);

      const actual = {
        enDuplicates: [
          enDocs.every((doc) => enDuplicates.duplicatedIds.has(doc.aposDocId)),
          enDuplicates.duplicatedDocs.length
        ],
        frDuplicates: [
          frDocs.every((doc) => frDuplicates.duplicatedIds.has(doc.aposDocId)),
          frDuplicates.duplicatedIds.has(user.aposDocId),
          frDuplicates.duplicatedDocs.length
        ]
      };
      const expected = {
        enDuplicates: [ true, 3 ],
        frDuplicates: [ false, true, 1 ]
      };

      assert.deepStrictEqual(actual, expected);
    });

    it('should not rewrite the docs locale when the locale is not different', async function() {
      gzip.input = async exportPath => {
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

      await importExportManager.overrideDuplicates(req);
    });

    it('should rewrite the docs locale when the locale is different and the `overrideLocale` param is provided', async function() {
      const req = apos.task.getReq({
        locale: 'en',
        body: {
          formatLabel: 'gzip',
          overrideLocale: true
        }
      });

      gzip.input = async exportPath => {
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

      await importExportManager.overrideDuplicates(req);
    });
  });
});
