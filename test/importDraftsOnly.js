const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const {
  getAppConfig, insertAdminUser, deletePiecesAndPages
} = require('./util');

describe('#import - when `importDraftsOnly` option is set to `true`', function () {
  this.timeout(t.timeout);

  let apos;
  let req;
  let input;
  let insertDocs;
  let mimeType;
  let gzip;
  let importExportManager;

  after(async function () {
    await t.destroy(apos);
  });

  before(async function () {
    apos = await t.create({
      root: module,
      testModule: true,
      modules: getAppConfig({
        '@apostrophecms/express': {
          options: {
            session: { secret: 'supersecret' }
          }
        }
      })
    });

    importExportManager = apos.modules['@apostrophecms/import-export'];
    importExportManager.removeExportFileFromUploadFs = () => { };
    importExportManager.remove = () => { };
    gzip = importExportManager.formats.gzip;
    mimeType = gzip.allowedTypes[0];

    await insertAdminUser(apos);
  });

  this.beforeEach(async function () {
    input = gzip.input;
    insertDocs = apos.modules['@apostrophecms/import-export'].insertDocs;

    await deletePiecesAndPages(apos);
  });

  this.afterEach(function () {
    gzip.input = input;
    apos.modules['@apostrophecms/import-export'].insertDocs = insertDocs;
  });

  describe('when `importDraftsOnly` option is not set', function () {
    this.beforeEach(async function () {
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
    });

    it('should import all the documents', async function () {
      gzip.input = async req => {
        return {
          docs: [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1 DRAFT',
              type: 'topic'
            },
            {
              _id: '4:en:published',
              aposMode: 'published',
              aposLocale: 'en:published',
              title: 'topic1 PUBLISHED',
              type: 'topic'
            }
          ],
          attachmentsInfo: []
        };
      };
      apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs }) => {
        assert.deepEqual(docs, [
          {
            _id: '4:en:draft',
            aposMode: 'draft',
            aposLocale: 'en:draft',
            title: 'topic1 DRAFT',
            type: 'topic'
          },
          {
            _id: '4:en:published',
            aposMode: 'published',
            aposLocale: 'en:published',
            title: 'topic1 PUBLISHED',
            type: 'topic'
          }
        ]);

        return {
          duplicatedDocs: [],
          duplicatedIds: [],
          failedIds: []
        };
      };

      await importExportManager.import(req);
    });
  });

  describe('when `importDraftsOnly` option is set to `true`', function () {
    this.beforeEach(async function () {
      req = apos.task.getReq({
        locale: 'en',
        body: {
          importDraftsOnly: true,
          formatLabel: 'gzip'
        },
        files: {
          file: {
            path: '/some/path/to/file',
            type: mimeType
          }
        }
      });
    });

    describe('when inserting a imported document', function () {
      it('should import only the published documents as draft', async function () {
        gzip.input = async req => {
          return {
            docs: [
              {
                _id: '4:en:draft',
                aposMode: 'draft',
                aposLocale: 'en:draft',
                title: 'topic1 DRAFT',
                type: 'topic',
                lastPublishedAt: '2021-01-01T00:00:00.000Z'
              },
              {
                _id: '4:en:published',
                aposMode: 'published',
                aposLocale: 'en:published',
                title: 'topic1 PUBLISHED',
                type: 'topic',
                lastPublishedAt: '2021-01-01T00:00:00.000Z'
              }
            ],
            attachmentsInfo: []
          };
        };
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs, ...rest }) => {
          assert.deepEqual(docs, [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1 PUBLISHED',
              type: 'topic',
              lastPublishedAt: '2021-01-01T00:00:00.000Z'
            }
          ]);

          return insertDocs(req, {
            docs,
            ...rest
          });
        };

        await importExportManager.import(req);

        const topics = await apos.doc.db
          .find({ type: 'topic' })
          .toArray();

        assert.equal(topics.length, 1);
        assert.equal(topics[0]._id, '4:en:draft');
        assert.equal(topics[0].aposMode, 'draft');
        assert.equal(topics[0].aposLocale, 'en:draft');
        assert.equal(topics[0].title, 'topic1 PUBLISHED');
        assert.equal(topics[0].lastPublishedAt, undefined);
      });

      it('should import the documents in draft if they do not have a published version to import', async function () {
        gzip.input = async req => {
          return {
            docs: [
              {
                _id: '4:en:draft',
                aposMode: 'draft',
                aposLocale: 'en:draft',
                title: 'topic1 DRAFT',
                type: 'topic',
                lastPublishedAt: '2021-01-01T00:00:00.000Z'
              }
            ],
            attachmentsInfo: []
          };
        };
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs, ...rest }) => {
          assert.deepEqual(docs, [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1 DRAFT',
              type: 'topic',
              lastPublishedAt: '2021-01-01T00:00:00.000Z'
            }
          ]);

          return insertDocs(req, {
            docs,
            ...rest
          });
        };

        await importExportManager.import(req);

        const topics = await apos.doc.db
          .find({ type: 'topic' })
          .toArray();

        assert.equal(topics.length, 1);
        assert.equal(topics[0]._id, '4:en:draft');
        assert.equal(topics[0].aposMode, 'draft');
        assert.equal(topics[0].aposLocale, 'en:draft');
        assert.equal(topics[0].title, 'topic1 DRAFT');
        assert.equal(topics[0].lastPublishedAt, undefined);
      });

      describe('when importing from a man-made CSV file', function() {
        let csv;
        let input;

        before(function() {
          csv = importExportManager.formats.csv;
        });

        this.beforeEach(async function () {
          req = apos.task.getReq({
            locale: 'en',
            body: {
              importDraftsOnly: true,
              formatLabel: 'CSV'
            },
            files: {
              file: {
                path: null,
                type: csv.allowedTypes[0]
              }
            }
          });

          input = csv.input;
          await deletePiecesAndPages(apos);
        });

        this.afterEach(function() {
          csv.input = input;
        });

        it('should import a piece from a csv file that was not made from the import-export module, as draft only', async function() {
          importExportManager.formats.csv.input = async () => {
            return {
              docs: [
                {
                  type: 'topic',
                  title: 'topic1',
                  lastPublishedAt: '2021-01-01T00:00:00.000Z'
                }
              ]
            };
          };

          await importExportManager.import(req);

          const topics = await apos.doc.db
            .find({ type: 'topic' })
            .toArray();

          assert.equal(topics.length, 1);
          assert.equal(topics[0]._id.endsWith(':en:draft'), true);
          assert.equal(topics[0].aposMode, 'draft');
          assert.equal(topics[0].aposLocale, 'en:draft');
          assert.equal(topics[0].title, 'topic1');
          assert.equal(topics[0].lastPublishedAt, undefined);
        });

        it('should import a page from a csv file that was not made from the import-export module, as draft only', async function() {
          importExportManager.formats.csv.input = async () => {
            return {
              docs: [
                {
                  type: 'default-page',
                  title: 'page1',
                  lastPublishedAt: '2021-01-01T00:00:00.000Z'
                }
              ]
            };
          };

          await importExportManager.import(req);

          const pages = await apos.doc.db
            .find({ type: 'default-page' })
            .toArray();

          assert.equal(pages.length, 1);
          assert.equal(pages[0]._id.endsWith(':en:draft'), true);
          assert.equal(pages[0].aposMode, 'draft');
          assert.equal(pages[0].aposLocale, 'en:draft');
          assert.equal(pages[0].title, 'page1');
          assert.equal(pages[0].lastPublishedAt, undefined);
        });
      });
    });

    describe('when updating a imported document', function () {
      it('should import only the published documents as draft', async function () {
        gzip.input = async req => {
          return {
            docs: [
              {
                _id: '4:en:draft',
                aposDocId: '4',
                aposMode: 'draft',
                aposLocale: 'en:draft',
                title: 'topic1 DRAFT',
                type: 'topic'
              },
              {
                _id: '4:en:published',
                aposDocId: '4',
                aposMode: 'published',
                aposLocale: 'en:published',
                title: 'topic1 PUBLISHED',
                type: 'topic'
              }
            ],
            attachmentsInfo: []
          };
        };

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
          exportPathId,
          jobId,
          notificationId,
          formatLabel
        } = await importExportManager.import(req);

        const _req = req.clone({
          body: {
            ...req.body,
            docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
            duplicatedDocs,
            importedAttachments,
            exportPathId,
            jobId,
            notificationId,
            formatLabel
          }
        });

        await importExportManager.overrideDuplicates(_req);

        const topics = await apos.doc.db
          .find({ type: 'topic' })
          .toArray();

        assert.equal(topics.length, 2);

        assert.equal(topics[0]._id, '4:en:draft');
        assert.equal(topics[0].aposMode, 'draft');
        assert.equal(topics[0].aposLocale, 'en:draft');
        assert.equal(topics[0].title, 'topic1 PUBLISHED');
        assert.equal(topics[0].modified, true);

        assert.equal(topics[1]._id, '4:en:published');
        assert.equal(topics[1].aposMode, 'published');
        assert.equal(topics[1].aposLocale, 'en:published');
        assert.equal(topics[1].title, 'topic1 EXISTING PUBLISHED');
      });

      it('should import only the published documents as draft and not set modified if the draft does not differ from publish', async function () {
        gzip.input = async req => {
          return {
            docs: [
              {
                _id: '4:en:draft',
                aposDocId: '4',
                aposMode: 'draft',
                aposLocale: 'en:draft',
                title: 'topic1 DRAFT',
                type: 'topic',
                slug: 'topic1-draft'
              },
              {
                _id: '4:en:published',
                aposDocId: '4',
                aposMode: 'published',
                aposLocale: 'en:published',
                title: 'topic1 PUBLISHED',
                type: 'topic',
                slug: 'topic1-foo'
              }
            ],
            attachmentsInfo: []
          };
        };

        await apos.topic.insert(apos.task.getReq({ mode: 'draft' }), {
          ...apos.topic.newInstance(),
          _id: '4:en:draft',
          slug: 'topic1-draft',
          title: 'topic1 EXISTING DRAFT'
        });

        await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
          ...apos.topic.newInstance(),
          _id: '4:en:published',
          slug: 'topic1-foo',
          title: 'topic1 PUBLISHED'
        });

        const {
          duplicatedDocs,
          importedAttachments,
          exportPathId,
          jobId,
          notificationId,
          formatLabel
        } = await importExportManager.import(req);

        const _req = req.clone({
          body: {
            ...req.body,
            docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
            duplicatedDocs,
            importedAttachments,
            exportPathId,
            jobId,
            notificationId,
            formatLabel
          }
        });

        await importExportManager.overrideDuplicates(_req);

        const topics = await apos.doc.db
          .find({ type: 'topic' })
          .toArray();

        assert.equal(topics.length, 2);

        assert.equal(topics[0]._id, '4:en:draft');
        assert.equal(topics[0].aposMode, 'draft');
        assert.equal(topics[0].aposLocale, 'en:draft');
        assert.equal(topics[0].title, 'topic1 PUBLISHED');
        assert.equal(topics[0].slug, 'topic1-foo');
        assert.equal(topics[0].modified, false); // IMPORTANT, should be set to false

        assert.equal(topics[1]._id, '4:en:published');
        assert.equal(topics[1].aposMode, 'published');
        assert.equal(topics[1].aposLocale, 'en:published');
        assert.equal(topics[1].title, 'topic1 PUBLISHED');
        assert.equal(topics[0].slug, 'topic1-foo');
      });

      describe('when importing from a man-made CSV file', function() {
        let csv;
        let input;

        before(function() {
          csv = importExportManager.formats.csv;
        });

        this.beforeEach(async function () {
          req = apos.task.getReq({
            locale: 'en',
            body: {
              importDraftsOnly: true,
              formatLabel: 'CSV'
            },
            files: {
              file: {
                path: null,
                type: csv.allowedTypes[0]
              }
            }
          });

          input = csv.input;
          await deletePiecesAndPages(apos);
        });

        this.afterEach(function() {
          csv.input = input;
        });

        it('should import a piece from a csv file that was not made from the import-export module, as draft only', async function() {
          importExportManager.formats.csv.input = async () => {
            return {
              docs: [
                {
                  type: 'topic',
                  'title:key': 'topic1',
                  title: 'topic1 - edited',
                  lastPublishedAt: '2021-01-01T00:00:00.000Z'
                }
              ]
            };
          };

          await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
            ...apos.topic.newInstance(),
            title: 'topic1'
          });

          await importExportManager.import(req);

          const topics = await apos.doc.db
            .find({ type: 'topic' })
            .toArray();

          assert.equal(topics.length, 2);

          assert.equal(topics[0]._id.endsWith(':en:draft'), true);
          assert.equal(topics[0].title, 'topic1 - edited');
          assert.equal(topics[0].aposMode, 'draft');
          assert.equal(topics[0].aposLocale, 'en:draft');
          assert.equal(topics[0].modified, true);
          assert(topics[0].lastPublishedAt);

          assert.equal(topics[1]._id.endsWith(':en:published'), true);
          assert.equal(topics[1].title, 'topic1');
          assert.equal(topics[1].aposMode, 'published');
          assert.equal(topics[1].aposLocale, 'en:published');
          assert(topics[1].lastPublishedAt);
        });

        it('should import a piece from a csv file that was not made from the import-export module, as draft only and not set modified if the draft does not differ from publish', async function() {
          importExportManager.formats.csv.input = async () => {
            return {
              docs: [
                {
                  type: 'topic',
                  'title:key': 'topic1 aaa',
                  title: 'topic1 bbb',
                  slug: 'topic1-bbb',
                  lastPublishedAt: '2021-01-01T00:00:00.000Z'
                }
              ]
            };
          };

          const piece = await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
            ...apos.topic.newInstance(),
            title: 'topic1 bbb',
            slug: 'topic1-bbb'
          });

          await apos.doc.db.updateOne({ _id: piece._id.replace(':published', ':draft') }, {
            $set: {
              title: 'topic1 aaa',
              slug: 'topic1-aaa'
            }
          });

          await importExportManager.import(req);

          const topics = await apos.doc.db
            .find({ type: 'topic' })
            .toArray();

          assert.equal(topics.length, 2);

          assert.equal(topics[0]._id.endsWith(':en:draft'), true);
          assert.equal(topics[0].title, 'topic1 bbb');
          assert.equal(topics[0].slug, 'topic1-bbb');
          assert.equal(topics[0].aposMode, 'draft');
          assert.equal(topics[0].aposLocale, 'en:draft');
          assert.equal(topics[0].modified, false); // IMPORTANT, should be set to false
          assert(topics[0].lastPublishedAt);

          assert.equal(topics[1]._id.endsWith(':en:published'), true);
          assert.equal(topics[1].title, 'topic1 bbb');
          assert.equal(topics[1].slug, 'topic1-bbb');
          assert.equal(topics[1].aposMode, 'published');
          assert.equal(topics[1].aposLocale, 'en:published');
          assert(topics[1].lastPublishedAt);
        });

        it('should import a page from a csv file that was not made from the import-export module, as draft only', async function() {
          importExportManager.formats.csv.input = async () => {
            return {
              docs: [
                {
                  type: 'default-page',
                  'title:key': 'page1',
                  title: 'page1 - edited',
                  lastPublishedAt: '2021-01-01T00:00:00.000Z'
                }
              ]
            };
          };

          await apos.page.insert(apos.task.getReq({ mode: 'published' }), '_home', 'lastChild', {
            ...apos.modules['default-page'].newInstance(),
            title: 'page1'
          });

          await importExportManager.import(req);

          const pages = await apos.doc.db
            .find({ type: 'default-page' })
            .toArray();

          assert.equal(pages.length, 2);

          assert.equal(pages[0]._id.endsWith(':en:draft'), true);
          assert.equal(pages[0].title, 'page1 - edited');
          assert.equal(pages[0].aposMode, 'draft');
          assert.equal(pages[0].aposLocale, 'en:draft');
          assert.equal(pages[0].modified, true);
          assert(pages[0].lastPublishedAt);

          assert.equal(pages[1]._id.endsWith(':en:published'), true);
          assert.equal(pages[1].title, 'page1');
          assert.equal(pages[1].aposMode, 'published');
          assert.equal(pages[1].aposLocale, 'en:published');
          assert(pages[1].lastPublishedAt);
        });

        it('should import a page from a csv file that was not made from the import-export module, as draft only and not set modified if the draft does not differ from publish', async function() {
          importExportManager.formats.csv.input = async () => {
            return {
              docs: [
                {
                  type: 'default-page',
                  'title:key': 'page1 aaa',
                  title: 'page1 bbb',
                  slug: '/page1-bbb',
                  lastPublishedAt: '2021-01-01T00:00:00.000Z'
                }
              ]
            };
          };

          const page = await apos.page.insert(apos.task.getReq({ mode: 'published' }), '_home', 'lastChild', {
            ...apos.modules['default-page'].newInstance(),
            title: 'page1 bbb',
            slug: '/page1-bbb'
          });

          await apos.doc.db.updateOne({ _id: page._id.replace(':published', ':draft') }, {
            $set: {
              title: 'page1 aaa',
              slug: '/page1-aaa'
            }
          });

          await importExportManager.import(req);

          const pages = await apos.doc.db
            .find({ type: 'default-page' })
            .toArray();

          assert.equal(pages.length, 2);

          assert.equal(pages[0]._id.endsWith(':en:draft'), true);
          assert.equal(pages[0].title, 'page1 bbb');
          assert.equal(pages[0].slug, '/page1-bbb');
          assert.equal(pages[0].aposMode, 'draft');
          assert.equal(pages[0].aposLocale, 'en:draft');
          assert.equal(pages[0].modified, false); // IMPORTANT, should be set to false
          assert(pages[0].lastPublishedAt);

          assert.equal(pages[1]._id.endsWith(':en:published'), true);
          assert.equal(pages[1].title, 'page1 bbb');
          assert.equal(pages[1].slug, '/page1-bbb');
          assert.equal(pages[1].aposMode, 'published');
          assert.equal(pages[1].aposLocale, 'en:published');
          assert(pages[1].lastPublishedAt);
        });
      });
    });
  });
});
