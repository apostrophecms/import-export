const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const fs = require('fs/promises');
const {
  createReadStream
} = require('fs');
const path = require('path');
const FormData = require('form-data');

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
    await deletePiecesAndPages(apos);
    await deleteAttachments(apos, attachmentPath);
    await insertPiecesAndPages(apos);
  });

  afterEach(async function() {
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

    const attachmentFiles = await fs.readdir(attachmentPath);

    const actual = {
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

  describe('#import - overriding locales integration tests', function() {
    let req;
    let notify;
    let input;
    let rewriteDocsWithCurrentLocale;
    let insertDocs;

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

    describe('when the site has only one locale', function() {
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
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
          assert.deepEqual(docs, [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
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
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
          assert.deepEqual(docs, [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
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
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
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
        apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
          assert.deepEqual(docs, [
            {
              _id: '4:en:draft',
              aposMode: 'draft',
              aposLocale: 'en:draft',
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
    });
  });

  describe('#overrideDuplicates - overriding locales integration tests', function() {
    let req;
    let input;
    let rewriteDocsWithCurrentLocale;
    let jobManager;

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

    describe('when the site has only one locale', function() {
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

        importExportManager = apos.modules['@apostrophecms/import-export'];
        importExportManager.removeExportFileFromUploadFs = () => {};
        importExportManager.remove = () => {};

        await insertAdminUser(apos);
        await insertPiecesAndPages(apos);
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

        await deletePiecesAndPages(apos);
        await deleteAttachments(apos, attachmentPath);
      });

      this.afterEach(function() {
        gzip.input = input;
        apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = rewriteDocsWithCurrentLocale;
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
});

function extractFileNames (files) {
  return files.map((fullname) => {
    const regex = /-([\w\d-]+)\./;
    const [ , name ] = regex.exec(fullname);

    return name;
  });
}

async function getExtractedFiles(extractPath) {
  const docsData = await fs.readFile(
    path.join(extractPath, 'aposDocs.json'),
    { encoding: 'utf8' }
  );

  const attachmentsData = await fs.readFile(
    path.join(extractPath, 'aposAttachments.json'),
    { encoding: 'utf8' }
  );

  const attachmentFiles = await fs.readdir(path.join(extractPath, 'attachments'));

  return {
    docs: JSON.parse(docsData),
    attachments: JSON.parse(attachmentsData),
    attachmentFiles
  };
}

async function cleanData(paths) {
  try {
    for (const filePath of paths) {
      const files = await fs.readdir(filePath);
      for (const name of files) {
        await fs.rm(path.join(filePath, name), { recursive: true });
      }
    }
  } catch (err) {
    assert(!err);
  }
}

async function deletePiecesAndPages(apos) {
  await apos.doc.db.deleteMany({ type: /default-page|article|topic|@apostrophecms\/image/ });
}

async function deleteAttachments(apos, attachmentPath) {
  await apos.attachment.db.deleteMany({});
  await cleanData([ attachmentPath ]);
}

async function insertPiecesAndPages(apos) {
  const req = apos.task.getReq();

  const formData = new FormData();
  formData.append(
    'file',
    createReadStream(path.join(apos.rootDir, '/public/test-image.jpg'))
  );

  const jar = await login(apos.http);

  const attachment = await apos.http.post('/api/v1/@apostrophecms/attachment/upload', {
    body: formData,
    jar
  });

  const image1 = await apos.image.insert(req, {
    ...apos.image.newInstance(),
    title: 'image1',
    attachment
  });

  const topic3 = await apos.topic.insert(req, {
    ...apos.topic.newInstance(),
    title: 'topic3'
  });

  const topic2 = await apos.topic.insert(req, {
    ...apos.topic.newInstance(),
    title: 'topic2'
  });

  const topic1 = await apos.topic.insert(req, {
    ...apos.topic.newInstance(),
    title: 'topic1',
    _topics: [ topic3 ]
  });

  await apos.article.insert(req, {
    ...apos.article.newInstance(),
    title: 'article1',
    _topics: [ topic2 ],
    image: attachment
  });

  const article2 = await apos.article.insert(req, {
    ...apos.article.newInstance(),
    title: 'article2',
    _topics: [ topic1 ]
  });

  const pageInstance = await apos.http.post('/api/v1/@apostrophecms/page', {
    body: {
      _newInstance: true
    },
    jar
  });

  await apos.page.insert(req, '_home', 'lastChild', {
    ...pageInstance,
    title: 'page1',
    type: 'default-page',
    _articles: [ article2 ],
    main: {
      _id: 'areaId',
      items: [
        {
          _id: 'cllp5ubqk001320613gaz2vmv',
          metaType: 'widget',
          type: '@apostrophecms/image',
          aposPlaceholder: false,
          imageIds: [ image1.aposDocId ],
          imageFields: {
            [image1.aposDocId]: {
              top: null,
              left: null,
              width: null,
              height: null,
              x: null,
              y: null
            }
          }
        }
      ],
      metaType: 'area'
    }
  });
}

async function login(http, username = 'admin') {
  const jar = http.jar();

  await http.post('/api/v1/@apostrophecms/login/login', {
    body: {
      username,
      password: username,
      session: true
    },
    jar
  });

  const loggedPage = await http.get('/', {
    jar
  });

  assert(loggedPage.match(/logged in/));

  return jar;
}

async function insertAdminUser(apos) {
  const user = {
    ...apos.user.newInstance(),
    title: 'admin',
    username: 'admin',
    password: 'admin',
    role: 'admin'
  };

  await apos.user.insert(apos.task.getReq(), user);
}

function getAppConfig(modules = {}) {
  return {
    '@apostrophecms/express': {
      options: {
        session: { secret: 'supersecret' }
      }
    },
    '@apostrophecms/import-export': {},
    'home-page': {
      extend: '@apostrophecms/page-type'
    },
    'default-page': {
      extend: '@apostrophecms/page-type',
      fields: {
        add: {
          main: {
            label: 'Main',
            type: 'area',
            options: {
              widgets: {
                '@apostrophecms/rich-text': {},
                '@apostrophecms/image': {},
                '@apostrophecms/video': {}
              }
            }
          },
          _articles: {
            label: 'Articles',
            type: 'relationship',
            withType: 'article'
          }
        }
      }
    },

    article: {
      extend: '@apostrophecms/piece-type',
      options: {
        alias: 'article',
        autopublish: true
      },
      fields: {
        add: {
          image: {
            type: 'attachment',
            group: 'images'
          },
          _topics: {
            label: 'Topics',
            type: 'relationship',
            withType: 'topic'
          }
        }
      }
    },

    topic: {
      extend: '@apostrophecms/piece-type',
      options: {
        alias: 'topic'
      },
      fields: {
        add: {
          description: {
            label: 'Description',
            type: 'string'
          },
          _topics: {
            label: 'Related Topics',
            type: 'relationship',
            withType: 'topic',
            max: 2
          }
        }
      }
    },

    ...modules
  };
}
