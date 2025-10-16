const assert = require('assert').strict;
const path = require('node:path');
const t = require('apostrophe/test-lib/util.js');
const {
  getAppConfig, insertAdminUser, deletePiecesAndPages, copyFixtures
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

      describe.only('when importing from a CSV file', function() {
        this.beforeEach(async function () {
          await deletePiecesAndPages(apos);
          await copyFixtures(apos);

          req = apos.task.getReq({
            locale: 'en',
            body: {
              importDraftsOnly: true,
              formatLabel: 'CSV'
            }
          });
        });

        it('should import a piece from a csv file that was not made from the import-export module, as draft only', async function() {
          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/topic-type-title-lastPublishedAt.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            })
          );

          const topics = await apos.doc.db
            .find({ type: 'topic' })
            .toArray();

          const actual = topics.map(topic => ({
            ...topic,
            lastPublishedAt: topic.lastPublishedAt
          }));
          const expected = [
            {
              ...topics.at(0),
              _id: topics.at(0).aposDocId.concat(':en:draft'),
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1',
              lastPublishedAt: undefined
            }
          ];

          assert.deepEqual(actual, expected);
        });

        it('should import a piece from a csv file without a type column, as long as the module name is known', async function() {
          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/topic-title.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            }),
            'topic'
          );

          const topics = await apos.doc.db
            .find({ type: 'topic' })
            .toArray();

          const actual = topics.map(topic => ({
            ...topic,
            lastPublishedAt: topic.lastPublishedAt
          }));
          const expected = [
            {
              ...topics.at(0),
              _id: topics.at(0).aposDocId.concat(':en:draft'),
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1',
              lastPublishedAt: undefined
            }
          ];

          assert.deepEqual(actual, expected);
        });

        it('should import a page from a csv file that was not made from the import-export module, as draft only', async function() {
          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/default-page-type-title-lastPublishedAt.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            })
          );

          const pages = await apos.doc.db
            .find({ type: 'default-page' })
            .toArray();

          const actual = pages.map(page => ({
            ...page,
            lastPublishedAt: page.lastPublishedAt
          }));
          const expected = [
            {
              ...pages.at(0),
              _id: pages.at(0).aposDocId.concat(':en:draft'),
              aposLocale: 'en:draft',
              aposMode: 'draft',
              lastPublishedAt: undefined,
              title: 'page1'
            }
          ];

          assert.deepEqual(actual, expected);
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
          exportId,
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
          exportId,
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

      describe.only('when importing from a CSV file', function() {
        this.beforeEach(async function () {
          await deletePiecesAndPages(apos);
          await copyFixtures(apos);

          req = apos.task.getReq({
            locale: 'en',
            body: {
              importDraftsOnly: true,
              formatLabel: 'CSV'
            }
          });
        });

        it('should import a piece from a csv file that was not made from the import-export module, as draft only', async function() {
          await apos.topic.insert(apos.task.getReq({ mode: 'published' }), {
            ...apos.topic.newInstance(),
            title: 'topic1'
          });

          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/topic-type-titleKey-title-lastPublishedAt.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            })
          );

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
              lastPublishedAt: topics.at(0).lastPublishedAt,
              modified: true,
              title: 'topic1 - edited'
            },
            {
              ...topics.at(1),
              _id: topics.at(1).aposDocId.concat(':en:published'),
              aposLocale: 'en:published',
              aposMode: 'published',
              lastPublishedAt: topics.at(1).lastPublishedAt,
              title: 'topic1'
            }
          ];
          assert.deepEqual(actual, expected);
        });

        it('should import a piece from a csv file that was not made from the import-export module, as draft only and not set modified if the draft does not differ from publish', async function() {
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

          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/topic-type-titleKey-title-slug-lastPublishedAt.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            })
          );

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
              lastPublishedAt: topics.at(0).lastPublishedAt,
              modified: false, // IMPORTANT, should be set to false
              slug: 'topic1-bbb',
              title: 'topic1 bbb'
            },
            {
              ...topics.at(1),
              _id: topics.at(1).aposDocId.concat(':en:published'),
              aposLocale: 'en:published',
              aposMode: 'published',
              lastPublishedAt: topics.at(1).lastPublishedAt,
              slug: 'topic1-bbb',
              title: 'topic1 bbb'
            }
          ];

          assert.deepEqual(actual, expected);
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

          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/default-page-type-titleKey-title-lastPublishedAt.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            })
          );

          const pages = await apos.doc.db
            .find({ type: 'default-page' })
            .toArray();

          const actual = pages;
          const expected = [
            {
              ...pages.at(0),
              _id: pages.at(0).aposDocId.concat(':en:draft'),
              aposLocale: 'en:draft',
              aposMode: 'draft',
              lastPublishedAt: pages.at(0).lastPublishedAt,
              modified: true,
              title: 'page1 - edited'
            },
            {
              ...pages.at(1),
              _id: pages.at(1).aposDocId.concat(':en:published'),
              aposLocale: 'en:published',
              aposMode: 'published',
              lastPublishedAt: pages.at(1).lastPublishedAt,
              title: 'page1'
            }
          ];

          assert.deepEqual(actual, expected);
        });

        it('should import a page from a csv file that was not made from the import-export module, as draft only and not set modified if the draft does not differ from publish', async function() {
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

          await importExportManager.import(
            req.clone({
              files: {
                file: {
                  path: path.join(apos.rootDir, 'data/temp/uploadfs/default-page-type-titleKey-title-slug-lastPublishedAt.csv'),
                  type: importExportManager.formats.csv.allowedTypes[0]
                }
              }
            })
          );

          const pages = await apos.doc.db
            .find({ type: 'default-page' })
            .toArray();

          const actual = pages;
          const expected = [
            {
              ...pages.at(0),
              _id: pages.at(0).aposDocId.concat(':en:draft'),
              aposLocale: 'en:draft',
              aposMode: 'draft',
              lastPublishedAt: pages.at(0).lastPublishedAt,
              modified: false, // IMPORTANT, should be set to false
              slug: '/page1-bbb',
              title: 'page1 bbb'
            },
            {
              ...pages.at(1),
              _id: pages.at(1).aposDocId.concat(':en:published'),
              aposLocale: 'en:published',
              aposMode: 'published',
              lastPublishedAt: pages.at(1).lastPublishedAt,
              slug: '/page1-bbb',
              title: 'page1 bbb'
            }
          ];

          assert.deepEqual(actual, expected);
        });
      });
    });
  });
});
