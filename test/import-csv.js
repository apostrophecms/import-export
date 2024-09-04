const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const path = require('path');
const {
  getAppConfig,
  cleanData,
  insertAdminUser,
  insertPiecesAndPages,
  deletePiecesAndPages,
  deleteAttachments
} = require('./util');

describe('@apostrophecms/import-export:csv', function () {
  let apos;
  let importExportManager;
  let attachmentPath;
  let exportsPath;
  let gzip;
  let mimeType;

  this.timeout(60000);

  before(async function() {
    apos = await t.create({
      root: module,
      testModule: true,
      modules: {
        ...getAppConfig(),
        '@apostrophecms/import-export': {
          options: {
            importExport: {
              export: {
                expiration: 10 * 1000
              }
            }
          }
        }
      }
    });

    attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
    exportsPath = path.join(apos.rootDir, 'public/uploads/exports');
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

  beforeEach(async function() {
    await insertPiecesAndPages(apos);
  });

  afterEach(async function() {
    await deletePiecesAndPages(apos);
    await deleteAttachments(apos, attachmentPath);
    await cleanData([ exportsPath ]);
  });

  describe('#import - man-made CSV file', function() {
    let notify;
    let input;
    let csv;

    const getImportReq = () => apos.task.getReq({
      locale: 'en',
      body: {},
      files: {
        file: {
          path: null,
          type: mimeType
        }
      }
    });

    this.beforeEach(async function() {
      csv = importExportManager.formats.csv;
      mimeType = csv.allowedTypes[0];

      notify = apos.notify;
      input = csv.input;

      await deletePiecesAndPages(apos);
      await deleteAttachments(apos, attachmentPath);
    });

    this.afterEach(function() {
      apos.notify = notify;
      csv.input = input;
    });

    it('should notify when the type is not provided', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              title: 'topic1',
              description: 'description1',
              main: '<p><em>rich</em> <strong>text</strong></p>'
            }
          ]
        };
      };

      const messages = [];

      apos.notify = async (req, message, options) => {
        messages.push(message);
        return notify(req, message, options);
      };

      await importExportManager.import(getImportReq());

      assert.equal(messages.some(message => message === 'aposImportExport:typeUnknown'), true);
    });

    it('should notify when the type does not exist', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'random-type',
              title: 'topic1',
              description: 'description1',
              main: '<p><em>rich</em> <strong>text</strong></p>'
            }
          ]
        };
      };

      const messages = [];

      apos.notify = async (req, message, options) => {
        messages.push(message);
        return notify(req, message, options);
      };

      await importExportManager.import(getImportReq());

      assert.equal(messages.some(message => message === 'aposImportExport:typeUnknown'), true);
    });

    it('should import a piece from a csv file that was not made from the import-export module', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'topic',
              title: 'topic1',
              description: 'description1',
              main: '<p><em>rich</em> <strong>text</strong></p>'
            }
          ]
        };
      };

      await importExportManager.import(getImportReq());

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      assert.equal(topics.length, 1);
      assert.equal(topics[0].title, 'topic1');
      assert.equal(topics[0].slug, 'topic1');
      assert.equal(topics[0].aposMode, 'draft');
      assert.equal(topics[0].description, 'description1');
      assert.equal(topics[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong></p>');
    });

    it('should import a page from a csv file that was not made from the import-export module', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'default-page',
              title: 'page1',
              main: '<p><em>rich</em> <strong>text</strong></p>'
            }
          ]
        };
      };

      await importExportManager.import(getImportReq());

      const pages = await apos.doc.db
        .find({ type: 'default-page' })
        .toArray();

      assert.equal(pages.length, 1);
      assert.equal(pages[0].title, 'page1');
      assert.equal(pages[0].slug, '/page1');
      assert.equal(pages[0].aposMode, 'draft');
      assert.equal(pages[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong></p>');
    });

    it('should insert a piece as draft and published when there is an update key that does not match any existing doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'topic',
              'title:key': 'topic1',
              title: 'topic1 - edited',
              description: 'description1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      await importExportManager.import(getImportReq());

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      assert.equal(topics.length, 2);

      assert.equal(topics[0].title, 'topic1 - edited');
      assert.equal(topics[0].slug, 'topic1-edited');
      assert.equal(topics[0].aposMode, 'draft');
      assert.equal(topics[0].description, 'description1 - edited');
      assert.equal(topics[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');

      assert.equal(topics[1].title, 'topic1 - edited');
      assert.equal(topics[1].slug, 'topic1-edited');
      assert.equal(topics[1].aposMode, 'published');
      assert.equal(topics[1].description, 'description1 - edited');
      assert.equal(topics[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should insert a page as draft and published when there is an update key that does not match any existing doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'default-page',
              'title:key': 'page1',
              title: 'page1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      await importExportManager.import(getImportReq());

      const pages = await apos.doc.db
        .find({ type: 'default-page' })
        .toArray();

      assert.equal(pages.length, 2);

      assert.equal(pages[0].title, 'page1 - edited');
      assert.equal(pages[0].slug, '/page1-edited');
      assert.equal(pages[0].aposMode, 'draft');
      assert.equal(pages[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');

      assert.equal(pages[1].title, 'page1 - edited');
      assert.equal(pages[1].slug, '/page1-edited');
      assert.equal(pages[1].aposMode, 'published');
      assert.equal(pages[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should insert a piece as draft and published when there is an empty update key', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'topic',
              'title:key': '',
              title: 'topic1 - edited',
              description: 'description1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      await importExportManager.import(getImportReq());

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      assert.equal(topics.length, 2);

      assert.equal(topics[0].title, 'topic1 - edited');
      assert.equal(topics[0].slug, 'topic1-edited');
      assert.equal(topics[0].aposMode, 'draft');
      assert.equal(topics[0].description, 'description1 - edited');
      assert.equal(topics[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');

      assert.equal(topics[1].title, 'topic1 - edited');
      assert.equal(topics[1].slug, 'topic1-edited');
      assert.equal(topics[1].aposMode, 'published');
      assert.equal(topics[1].description, 'description1 - edited');
      assert.equal(topics[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should insert a page as draft and published when there is an empty update key', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'default-page',
              'title:key': '',
              title: 'page1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      await importExportManager.import(getImportReq());

      const pages = await apos.doc.db
        .find({ type: 'default-page' })
        .toArray();

      assert.equal(pages.length, 2);

      assert.equal(pages[0].title, 'page1 - edited');
      assert.equal(pages[0].slug, '/page1-edited');
      assert.equal(pages[0].aposMode, 'draft');
      assert.equal(pages[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');

      assert.equal(pages[1].title, 'page1 - edited');
      assert.equal(pages[1].slug, '/page1-edited');
      assert.equal(pages[1].aposMode, 'published');
      assert.equal(pages[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should update a piece draft and published versions when there is an update key that matches an existing doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'topic',
              'title:key': 'topic1',
              title: 'topic1 - edited',
              description: 'description1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      const topic = await apos.topic.insert(apos.task.getReq(), {
        ...apos.topic.newInstance(),
        title: 'topic1',
        description: 'description1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      await importExportManager.import(getImportReq());

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      assert.equal(topics.length, 2);

      assert.equal(topics[0].aposDocId, topic.aposDocId);
      assert.equal(topics[0].title, 'topic1 - edited');
      assert.equal(topics[0].slug, 'topic1');
      assert.equal(topics[0].aposMode, 'draft');
      assert.equal(topics[0].description, 'description1 - edited');
      assert.equal(topics[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
      assert.equal(topics[0].modified, false);

      assert.equal(topics[1].aposDocId, topic.aposDocId);
      assert.equal(topics[1].title, 'topic1 - edited');
      assert.equal(topics[1].slug, 'topic1');
      assert.equal(topics[1].aposMode, 'published');
      assert.equal(topics[1].description, 'description1 - edited');
      assert.equal(topics[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should update a page draft and published versions when there is an update key that matches an existing doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'default-page',
              'title:key': 'page1',
              title: 'page1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      const page = await apos.page.insert(apos.task.getReq(), '_home', 'lastChild', {
        ...apos.modules['default-page'].newInstance(),
        title: 'page1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      await importExportManager.import(getImportReq());

      const pages = await apos.doc.db
        .find({ type: 'default-page' })
        .toArray();

      assert.equal(pages.length, 2);

      assert.equal(pages[0].aposDocId, page.aposDocId);
      assert.equal(pages[0].title, 'page1 - edited');
      assert.equal(pages[0].slug, '/page1');
      assert.equal(pages[0].aposMode, 'draft');
      assert.equal(pages[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
      assert.equal(pages[0].modified, false);

      assert.equal(pages[1].aposDocId, page.aposDocId);
      assert.equal(pages[1].title, 'page1 - edited');
      assert.equal(pages[1].slug, '/page1');
      assert.equal(pages[1].aposMode, 'published');
      assert.equal(pages[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should update a piece draft and published versions when there is an update key that only matches the existing draft doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'topic',
              'title:key': 'topic1',
              title: 'topic1 - edited',
              description: 'description1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      const topic = await apos.topic.insert(apos.task.getReq(), {
        ...apos.topic.newInstance(),
        title: 'topic1',
        description: 'description1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      // check that the published doc is also updated, even with a different title
      await apos.doc.db.updateOne(
        {
          aposDocId: topic.aposDocId,
          aposMode: 'published'
        },
        {
          $set: {
            title: 'topic1 - published title that does not match the draft title nor the update key'
          }
        }
      );

      await importExportManager.import(getImportReq());

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      assert.equal(topics.length, 2);

      assert.equal(topics[0].aposDocId, topic.aposDocId);
      assert.equal(topics[0].title, 'topic1 - edited');
      assert.equal(topics[0].slug, 'topic1');
      assert.equal(topics[0].aposMode, 'draft');
      assert.equal(topics[0].description, 'description1 - edited');
      assert.equal(topics[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
      assert.equal(topics[0].modified, false);

      assert.equal(topics[1].aposDocId, topic.aposDocId);
      assert.equal(topics[1].title, 'topic1 - edited');
      assert.equal(topics[1].slug, 'topic1');
      assert.equal(topics[1].aposMode, 'published');
      assert.equal(topics[1].description, 'description1 - edited');
      assert.equal(topics[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should update a page draft and published versions when there is an update key that only matches the existing draft doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'default-page',
              'title:key': 'page1',
              title: 'page1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      const page = await apos.page.insert(apos.task.getReq(), '_home', 'lastChild', {
        ...apos.modules['default-page'].newInstance(),
        title: 'page1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      // check that the published doc is also updated, even with a different title
      await apos.doc.db.updateOne(
        {
          aposDocId: page.aposDocId,
          aposMode: 'published'
        },
        {
          $set: {
            title: 'page1 - published title that does not match the draft title nor the update key'
          }
        }
      );

      await importExportManager.import(getImportReq());

      const pages = await apos.doc.db
        .find({ type: 'default-page' })
        .toArray();

      assert.equal(pages.length, 2);

      assert.equal(pages[0].aposDocId, page.aposDocId);
      assert.equal(pages[0].title, 'page1 - edited');
      assert.equal(pages[0].slug, '/page1');
      assert.equal(pages[0].aposMode, 'draft');
      assert.equal(pages[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
      assert.equal(pages[0].modified, false);

      assert.equal(pages[1].aposDocId, page.aposDocId);
      assert.equal(pages[1].title, 'page1 - edited');
      assert.equal(pages[1].slug, '/page1');
      assert.equal(pages[1].aposMode, 'published');
      assert.equal(pages[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should update a piece draft and published versions when there is an update key that matches only the existing published doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'topic',
              'title:key': 'topic1',
              title: 'topic1 - edited',
              description: 'description1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      const topic = await apos.topic.insert(apos.task.getReq(), {
        ...apos.topic.newInstance(),
        title: 'topic1',
        description: 'description1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      // check that the draft doc is also updated, even with a different title
      await apos.doc.db.updateOne(
        {
          aposDocId: topic.aposDocId,
          aposMode: 'draft'
        },
        {
          $set: {
            title: 'topic1 - draft title that does not match the published title nor the update key'
          }
        }
      );

      await importExportManager.import(getImportReq());

      const topics = await apos.doc.db
        .find({ type: 'topic' })
        .toArray();

      assert.equal(topics.length, 2);

      assert.equal(topics[0].aposDocId, topic.aposDocId);
      assert.equal(topics[0].title, 'topic1 - edited');
      assert.equal(topics[0].slug, 'topic1');
      assert.equal(topics[0].aposMode, 'draft');
      assert.equal(topics[0].description, 'description1 - edited');
      assert.equal(topics[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
      assert.equal(topics[0].modified, false);

      assert.equal(topics[1].aposDocId, topic.aposDocId);
      assert.equal(topics[1].title, 'topic1 - edited');
      assert.equal(topics[1].slug, 'topic1');
      assert.equal(topics[1].aposMode, 'published');
      assert.equal(topics[1].description, 'description1 - edited');
      assert.equal(topics[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });

    it('should update a page draft and published versions when there is an update key that only matches the existing published doc', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'default-page',
              'title:key': 'page1',
              title: 'page1 - edited',
              main: '<p><em>rich</em> <strong>text</strong> - edited</p>'
            }
          ]
        };
      };

      const page = await apos.page.insert(apos.task.getReq(), '_home', 'lastChild', {
        ...apos.modules['default-page'].newInstance(),
        title: 'page1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      // check that the draft doc is also updated, even with a different title
      await apos.doc.db.updateOne(
        {
          aposDocId: page.aposDocId,
          aposMode: 'draft'
        },
        {
          $set: {
            title: 'page1 - draft title that does not match the published title nor the update key'
          }
        }
      );

      await importExportManager.import(getImportReq());

      const pages = await apos.doc.db
        .find({ type: 'default-page' })
        .toArray();

      assert.equal(pages.length, 2);

      assert.equal(pages[0].aposDocId, page.aposDocId);
      assert.equal(pages[0].title, 'page1 - edited');
      assert.equal(pages[0].slug, '/page1');
      assert.equal(pages[0].aposMode, 'draft');
      assert.equal(pages[0].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
      assert.equal(pages[0].modified, false);

      assert.equal(pages[1].aposDocId, page.aposDocId);
      assert.equal(pages[1].title, 'page1 - edited');
      assert.equal(pages[1].slug, '/page1');
      assert.equal(pages[1].aposMode, 'published');
      assert.equal(pages[1].main.items[0].content, '<p><em>rich</em> <strong>text</strong> - edited</p>');
    });
  });
});
