const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const fs = require('fs/promises');
const path = require('path');
const {
  getAppConfig,
  insertAdminUser,
  insertPiecesAndPages,
  deletePiecesAndPages,
  deleteAttachments,
  cleanData,
  getExtractedFiles,
  extractFileNames
} = require('./util');

describe('@apostrophecms/import-export', function () {
  let apos;
  let importExportManager;
  let tempPath;
  let attachmentPath;
  let exportsPath;
  let gzip;
  let mimeType;
  let piecesTgzPath;
  let pageTgzPath;

  this.timeout(60000);

  before(async function() {
    apos = await t.create({
      root: module,
      testModule: true,
      modules: getAppConfig()
    });

    tempPath = path.join(apos.rootDir, 'data/temp/uploadfs');
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
    await cleanData([ tempPath, exportsPath, attachmentPath ]);
  });

  it('should generate a zip file for pieces without related documents', async function () {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();
    const manager = apos.article;

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'gzip',
      type: req.t(manager.options.pluralLabel)
    };
    const { url } = await importExportManager.export(req, manager);
    const fileName = path.basename(url);

    const { exportPath } = await gzip.input(path.join(exportsPath, fileName));

    const {
      docs, attachments, attachmentFiles
    } = await getExtractedFiles(exportPath);

    const actual = {
      docsLength: docs.length,
      attachmentsLength: attachments.length,
      attachmentFiles
    };
    const expected = {
      docsLength: 4,
      attachmentsLength: 0,
      attachmentFiles: []
    };

    assert.deepEqual(actual, expected);
  });

  it('should generate a zip file for pieces with related documents', async function () {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();
    const { _id: attachmentId } = await apos.attachment.db.findOne({ name: 'test-image' });
    const manager = apos.article;

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'topic' ],
      type: req.t(manager.options.pluralLabel)
    };

    const { url } = await importExportManager.export(req, manager);
    const fileName = path.basename(url);

    piecesTgzPath = path.join(exportsPath, fileName);
    const { exportPath } = await gzip.input(piecesTgzPath);

    const {
      docs, attachments, attachmentFiles
    } = await getExtractedFiles(exportPath);

    const actual = {
      docsNames: docs.map(({ title, aposMode }) => ({
        title,
        aposMode
      })),
      attachmentsLength: attachments.length,
      attachmentFiles
    };
    const expected = {
      docsNames: [
        {
          aposMode: 'draft',
          title: 'topic1'
        },
        {
          aposMode: 'draft',
          title: 'topic2'
        },
        {
          aposMode: 'published',
          title: 'topic1'
        },
        {
          aposMode: 'published',
          title: 'topic2'
        },
        {
          aposMode: 'draft',
          title: 'article2'
        },
        {
          aposMode: 'draft',
          title: 'article1'
        },
        {
          aposMode: 'published',
          title: 'article2'
        },

        {
          aposMode: 'published',
          title: 'article1'
        }
      ],
      attachmentsLength: 1,
      attachmentFiles: [ `${attachmentId}-test-image.jpg` ]
    };

    assert.deepEqual(actual, expected);
  });

  it('should generate a zip file for pages with related documents', async function () {
    const req = apos.task.getReq();
    const page1 = await apos.page.find(req, { title: 'page1' }).toObject();
    const { _id: attachmentId } = await apos.attachment.db.findOne({ name: 'test-image' });

    req.body = {
      _ids: [ page1._id ],
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'article' ],
      type: page1.type
    };

    const { url } = await importExportManager.export(req, apos.page);
    const fileName = path.basename(url);

    pageTgzPath = path.join(exportsPath, fileName);
    const { exportPath } = await gzip.input(pageTgzPath);

    const {
      docs, attachments, attachmentFiles
    } = await getExtractedFiles(exportPath);

    const actual = {
      docsNames: docs.map(({ title, aposMode }) => ({
        title,
        aposMode
      })),
      attachmentsLength: attachments.length,
      attachmentFiles
    };

    const expected = {
      docsNames: [
        {
          aposMode: 'draft',
          title: 'image1'
        },
        {
          aposMode: 'draft',
          title: 'article2'
        },
        {
          aposMode: 'published',
          title: 'image1'
        },
        {
          aposMode: 'published',
          title: 'article2'
        },
        {
          aposMode: 'draft',
          title: 'page1'
        },
        {
          aposMode: 'published',
          title: 'page1'
        }
      ],
      attachmentsLength: 1,
      attachmentFiles: [ `${attachmentId}-test-image.jpg` ]
    };

    assert.deepEqual(actual, expected);
  });

  it('should import pieces with related documents from a compressed file', async function() {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();
    const manager = apos.article;

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'topic' ],
      type: req.t(manager.options.pluralLabel)
    };

    const { url } = await importExportManager.export(req, manager);
    const fileName = path.basename(url);

    piecesTgzPath = path.join(exportsPath, fileName);

    await deletePiecesAndPages(apos);
    await deleteAttachments(apos, attachmentPath);

    req.body = {};
    req.files = {
      file: {
        path: piecesTgzPath,
        type: mimeType
      }
    };
    await importExportManager.import(req);

    const importedDocs = await apos.doc.db
      .find({ type: /article|topic|@apostrophecms\/image/ })
      .toArray();

    const importedAttachments = await apos.attachment.db
      .find()
      .toArray();

    const articlesWithRelatedImages = importedDocs
      .filter(({ title }) => title === 'article1')
      .map(({ image }) => ({
        title: image?.title,
        name: image?.name,
        type: image?.type
      }));

    const attachmentFiles = await fs.readdir(attachmentPath);

    const actual = {
      articlesWithRelatedImages,
      docsLength: importedDocs.length,
      docsTitles: importedDocs.map(({ title }) => title),
      attachmentsNames: importedAttachments.map(({ name }) => name),
      attachmentFileNames: attachmentFiles.map((fullName) => {
        const regex = /-([\w\d-]+)\./;
        const [ , name ] = regex.exec(fullName);
        return name;
      })
    };

    const expected = {
      articlesWithRelatedImages: [
        {
          title: 'test image',
          name: 'test-image',
          type: 'attachment'
        },
        {
          title: 'test image',
          name: 'test-image',
          type: 'attachment'
        } ],
      docsLength: 8,
      docsTitles: [
        'article2', 'article1',
        'article2', 'article1',
        'topic1', 'topic2',
        'topic1', 'topic2'
      ],
      attachmentsNames: [ 'test-image' ],
      attachmentFileNames: new Array(apos.attachment.imageSizes.length + 1)
        .fill('test-image')
    };

    assert.deepEqual(actual, expected);
  });

  it('should return duplicates pieces when already existing and override them', async function() {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();
    const manager = apos.article;

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'topic' ],
      type: req.t(manager.options.pluralLabel)
    };

    const { url } = await importExportManager.export(req, manager);
    const fileName = path.basename(url);

    piecesTgzPath = path.join(exportsPath, fileName);

    req.body = {};
    req.files = {
      file: {
        path: piecesTgzPath,
        type: mimeType
      }
    };

    const {
      duplicatedDocs,
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    } = await importExportManager.import(req);

    // We update the title of every targetted docs to be sure the update really occurs
    await apos.doc.db.updateMany({ type: /article|topic/ }, { $set: { title: 'new title' } });
    await apos.attachment.db.updateMany({}, { $set: { name: 'new-name' } });
    const filesNames = await fs.readdir(attachmentPath);

    // We rename all versions of the image to be sure the file is also updated
    for (const fileName of filesNames) {
      await fs.rename(
        path.join(attachmentPath, fileName),
        path.join(attachmentPath, fileName.replace('test-image', 'new-name'))
      );
    }

    delete req.files;
    req.body = {
      docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    };

    await importExportManager.overrideDuplicates(req);

    const updatedDocs = await apos.doc.db
      .find({
        type: /article|topic|@apostrophecms\/image/,
        aposMode: { $ne: 'previous' }
      })
      .toArray();
    const updatedAttachments = await apos.attachment.db.find().toArray();
    const attachmentFiles = await fs.readdir(attachmentPath);
    const job = await apos.modules['@apostrophecms/job'].db.findOne({ _id: jobId });

    const actual = {
      docTitles: updatedDocs.map(({ title }) => title),
      attachmentNames: updatedAttachments.map(({ name }) => name),
      attachmentFileNames: extractFileNames(attachmentFiles),
      job: {
        good: job.good,
        total: job.total
      }
    };

    const expected = {
      docTitles: [
        'image1',
        'image1',
        'article1',
        'article2',
        'article1',
        'article2',
        'new title',
        'topic2',
        'topic1',
        'new title',
        'topic2',
        'topic1'
      ],
      attachmentNames: [ 'test-image' ],
      attachmentFileNames: new Array(apos.attachment.imageSizes.length + 1)
        .fill('test-image'),
      job: {
        good: 9,
        total: 9
      }
    };

    assert.deepEqual(actual, expected);
  });

  it('should import page and related documents', async function() {
    const req = apos.task.getReq();
    const page1 = await apos.page.find(req, { title: 'page1' }).toObject();

    req.body = {
      _ids: [ page1._id ],
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'article' ],
      type: page1.type
    };

    const { url } = await importExportManager.export(req, apos.page);
    const fileName = path.basename(url);

    pageTgzPath = path.join(exportsPath, fileName);

    await deletePiecesAndPages(apos);
    await deleteAttachments(apos, attachmentPath);

    req.body = {};
    req.files = {
      file: {
        path: pageTgzPath,
        type: mimeType
      }
    };

    await importExportManager.import(req);

    const importedDocs = await apos.doc.db
      .find({ type: /default-page|article|topic|@apostrophecms\/image/ })
      .toArray();
    const importedAttachments = await apos.attachment.db.find(
      { aposMode: { $ne: 'previous' } }
    ).toArray();
    const attachmentFiles = await fs.readdir(attachmentPath);

    const actual = {
      docTitles: importedDocs.map(({ title }) => title),
      attachmentNames: importedAttachments.map(({ name }) => name),
      attachmentFileNames: extractFileNames(attachmentFiles)
    };

    const expected = {
      docTitles: [ 'image1', 'image1', 'article2', 'article2', 'page1', 'page1' ],
      attachmentNames: [ 'test-image' ],
      attachmentFileNames: new Array(apos.attachment.imageSizes.length + 1)
        .fill('test-image')
    };

    assert.deepEqual(actual, expected);
  });

  it('should return existing duplicated docs during page import and override them', async function() {
    const req = apos.task.getReq();
    const page1 = await apos.page.find(req, { title: 'page1' }).toObject();

    req.body = {
      _ids: [ page1._id ],
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'article' ],
      type: page1.type
    };

    const { url } = await importExportManager.export(req, apos.page);
    const fileName = path.basename(url);

    pageTgzPath = path.join(exportsPath, fileName);

    req.body = {};
    req.files = {
      file: {
        path: pageTgzPath,
        type: mimeType
      }
    };

    const {
      duplicatedDocs,
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    } = await importExportManager.import(req);

    // We update the title of every targetted docs to be sure the update really occurs
    await apos.doc.db.updateMany(
      { type: /default-page|article|@apostrophecms\/image/ },
      { $set: { title: 'new title' } }
    );
    await apos.attachment.db.updateMany({}, { $set: { name: 'new-name' } });
    const filesNames = await fs.readdir(attachmentPath);

    // We rename all versions of the image to be sure the file is also updated
    for (const fileName of filesNames) {
      await fs.rename(
        path.join(attachmentPath, fileName),
        path.join(attachmentPath, fileName.replace('test-image', 'new-name'))
      );
    }

    delete req.files;
    req.body = {
      docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    };

    await importExportManager.overrideDuplicates(req);

    const updatedDocs = await apos.doc.db
      .find({
        type: /default-page|article|@apostrophecms\/image/,
        aposMode: { $ne: 'previous' }
      })
      .toArray();
    const updatedAttachments = await apos.attachment.db.find().toArray();
    const attachmentFiles = await fs.readdir(attachmentPath);
    const job = await apos.modules['@apostrophecms/job'].db.findOne({ _id: jobId });

    const actual = {
      docTitles: updatedDocs.map(({ title }) => title),
      attachmentNames: updatedAttachments.map(({ name }) => name),
      attachmentFileNames: extractFileNames(attachmentFiles),
      job: {
        good: job.good,
        total: job.total
      }
    };

    const expected = {
      docTitles: [
        'image1',
        'image1',
        'new title',
        'article2',
        'new title',
        'article2',
        'page1',
        'page1'
      ],
      attachmentNames: [ 'test-image' ],
      attachmentFileNames: new Array(apos.attachment.imageSizes.length + 1)
        .fill('test-image'),
      job: {
        good: 7,
        total: 7
      }
    };

    assert.deepEqual(actual, expected);
  });

  it('should not override attachment if associated document is not imported', async function() {
    const req = apos.task.getReq();
    const page1 = await apos.page.find(req, { title: 'page1' }).toObject();

    req.body = {
      _ids: [ page1._id ],
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'article' ],
      type: page1.type
    };

    const { url } = await importExportManager.export(req, apos.page);
    const fileName = path.basename(url);

    pageTgzPath = path.join(exportsPath, fileName);

    req.body = {};
    req.files = {
      file: {
        path: pageTgzPath,
        type: mimeType
      }
    };

    const {
      duplicatedDocs,
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    } = await importExportManager.import(req);

    // We update the title of every targetted docs to be sure the update really occurs
    await apos.doc.db.updateMany(
      { type: /default-page|article|@apostrophecms\/image/ },
      { $set: { title: 'new title' } }
    );
    await apos.attachment.db.updateMany({}, { $set: { name: 'new-name' } });
    const filesNames = await fs.readdir(attachmentPath);

    // We rename all versions of the image to be sure the file is also updated
    for (const fileName of filesNames) {
      await fs.rename(
        path.join(attachmentPath, fileName),
        path.join(attachmentPath, fileName.replace('test-image', 'new-name'))
      );
    }

    delete req.files;
    req.body = {
      docIds: duplicatedDocs
        .filter(({ type }) => type !== '@apostrophecms/image')
        .map(({ aposDocId }) => aposDocId),
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    };

    await importExportManager.overrideDuplicates(req);

    const docs = await apos.doc.db
      .find({
        type: /default-page|article|@apostrophecms\/image/,
        aposMode: { $ne: 'previous' }
      })
      .toArray();
    const updatedAttachments = await apos.attachment.db.find().toArray();
    const attachmentFiles = await fs.readdir(attachmentPath);
    const job = await apos.modules['@apostrophecms/job'].db.findOne({ _id: jobId });

    const actual = {
      docTitles: docs.map(({ title }) => title),
      attachmentNames: updatedAttachments.map(({ name }) => name),
      attachmentFileNames: extractFileNames(attachmentFiles),
      job: {
        good: job.good,
        bad: job.bad,
        total: job.total
      }
    };

    const expected = {
      docTitles: [
        'new title',
        'new title',
        'new title',
        'article2',
        'new title',
        'article2',
        'page1',
        'page1'
      ],
      attachmentNames: [ 'new-name' ],
      attachmentFileNames: new Array(apos.attachment.imageSizes.length + 1)
        .fill('new-name'),
      job: {
        good: 4,
        bad: 0,
        total: 7
      }
    };

    assert.deepEqual(actual, expected);
  });

  it('should preserve lastPublishedAt property on import for existing drafts', async function() {
    const req = apos.task.getReq();
    const manager = apos.doc.getManager('default-page');
    const pageInstance = manager.newInstance();

    // PUBLISH a new page
    await apos.page.insert(req, '_home', 'lastChild', {
      ...pageInstance,
      title: 'page2',
      type: 'default-page',
      _articles: [],
      main: {
        _id: 'areaId',
        items: [],
        metaType: 'area'
      }
    });

    const page2 = await apos.page.find(req, { title: 'page2' }).toObject();

    // UNPUBLISH (draft) the page
    const draftPage = await apos.page.unpublish(req, page2);

    // EXPORT the page (as draft)
    req.body = {
      _ids: [ draftPage._id ],
      extension: 'gzip',
      type: draftPage.type
    };

    const { url } = await importExportManager.export(req, apos.page);
    const fileName = path.basename(url);

    pageTgzPath = path.join(exportsPath, fileName);

    // Now that it's exported as draft, PUBLISH the page again
    const { lastPublishedAt } = await apos.page.publish(req, draftPage);

    // Finally, IMPORT the previously exported draft page
    req.body = {};
    req.files = {
      file: {
        path: pageTgzPath,
        type: mimeType
      }
    };

    const {
      duplicatedDocs,
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    } = await importExportManager.import(req);

    req.body = {
      docIds: duplicatedDocs.map(doc => doc.aposDocId),
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    };

    await importExportManager.overrideDuplicates(req);

    const updatedPage = await apos.doc.db
      .find({ title: 'page2' })
      .toArray();

    assert.deepEqual(updatedPage.every((doc) => {
      return String(doc.lastPublishedAt) === String(lastPublishedAt);
    }), true, `expected imported docs 'lastPublishedAt' value to be of '${lastPublishedAt}'`);
  });

  describe('#getFirstDifferentLocale', function() {
    it('should find among the docs the first locale that is different from the req one', async function() {
      const req = {
        locale: 'fr-CA',
        mode: 'draft'
      };
      const docs = [
        {
          _id: '1:daft',
          aposMode: 'draft'
        },
        {
          _id: '2:fr:published',
          aposLocale: 'fr:published',
          aposMode: 'published'
        },
        {
          _id: '3:fr-CA:published',
          aposLocale: 'fr-CA:published',
          aposMode: 'published'
        },
        {
          _id: '4:en:draft',
          aposLocale: 'en:draft',
          aposMode: 'draft'
        }
      ];

      const actual = apos.modules['@apostrophecms/import-export'].getFirstDifferentLocale(req, docs);
      const expected = 'fr';

      assert.equal(actual, expected);
    });
  });

  describe('#rewriteDocsWithCurrentLocale', function() {
    it('should rewrite the docs locale with the req one', async function() {
      const req = {
        locale: 'fr-CA',
        mode: 'draft'
      };
      const docs = [
        {
          _id: '1:daft',
          aposMode: 'draft'
        },
        {
          _id: '2:fr:published',
          aposLocale: 'fr:published',
          aposMode: 'published'
        },
        {
          _id: '3:fr-CA:published',
          aposLocale: 'fr-CA:published',
          aposMode: 'published'
        },
        {
          _id: '4:en:draft',
          aposLocale: 'en:draft',
          aposMode: 'draft'
        }
      ];

      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale(req, docs);

      assert.deepEqual(docs, [
        {
          _id: '1:daft',
          aposMode: 'draft'
        },
        {
          _id: '2:fr-CA:published',
          aposLocale: 'fr-CA:published',
          aposMode: 'published'
        },
        {
          _id: '3:fr-CA:published',
          aposLocale: 'fr-CA:published',
          aposMode: 'published'
        },
        {
          _id: '4:fr-CA:draft',
          aposLocale: 'fr-CA:draft',
          aposMode: 'draft'
        }
      ]);
    });
  });

  describe('#import - man-made CSV file', function() {
    let req;
    let notify;
    let input;
    let csv;

    this.beforeEach(async function() {
      csv = importExportManager.formats.csv;
      mimeType = csv.allowedTypes[0];

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

      await importExportManager.import(req);

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

      await importExportManager.import(req);

      assert.equal(messages.some(message => message === 'aposImportExport:typeUnknown'), true);
    });

    // TODO: Waiting to see if we really need a different error if there is no type and an update key..
    it.skip('should notify when there is an update key and the type is not provided', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              title: 'topic1 - edited',
              'title:key': 'topic1',
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

      await importExportManager.import(req);

      assert.equal(messages.some(message => message === 'aposImportExport:typeColumnMissing'), true);
    });

    it.skip('should notify when there is an update key and the type does not exist', async function() {
      csv.input = async () => {
        return {
          docs: [
            {
              type: 'random-type',
              title: 'topic1 - edited',
              'title:key': 'topic1',
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

      await importExportManager.import(req);

      assert.equal(messages.some(message => message === 'aposImportExport:typeUnknownWithUpdateKey'), true);
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

      await importExportManager.import(req);

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

      await importExportManager.import(req);

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

      await importExportManager.import(req);

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

      await importExportManager.import(req);

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

      await importExportManager.import(req);

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

      await importExportManager.import(req);

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

      const topic = await apos.topic.insert(req, {
        ...apos.topic.newInstance(),
        title: 'topic1',
        description: 'description1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      await importExportManager.import(req);

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

      const page = await apos.page.insert(req, '_home', 'lastChild', {
        ...apos.modules['default-page'].newInstance(),
        title: 'page1',
        main: '<p><em>rich</em> <strong>text</strong></p>'
      });

      await importExportManager.import(req);

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

      const topic = await apos.topic.insert(req, {
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

      await importExportManager.import(req);

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

      const page = await apos.page.insert(req, '_home', 'lastChild', {
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

      await importExportManager.import(req);

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

      const topic = await apos.topic.insert(req, {
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

      await importExportManager.import(req);

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

      const page = await apos.page.insert(req, '_home', 'lastChild', {
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

      await importExportManager.import(req);

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
