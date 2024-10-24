const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const {
  getAppConfig, insertAdminUser, insertPiecesAndPages, deletePiecesAndPages
} = require('./util');

describe('#import - when `importDraftsOnly` option is set to `true`', function () {
  this.timeout(t.timeout);

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
    await insertPiecesAndPages(apos);
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
          importDraftsOnly: true
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
      it.only('should import only the published documents as draft', async function () {
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
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, { docs, ...rest }) => {
          assert.deepEqual(docs, [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
              title: 'topic1 PUBLISHED',
              type: 'topic'
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
      });

      it('should import the documents in draft if they do not have a published version to import', async function () {

      });

      describe('#import - man-made CSV file', function() {
      });
    });

    describe('when updating a imported document', function () {

    });
  });
});
