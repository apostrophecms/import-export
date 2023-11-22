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
  let attachmentPath;
  let exportsPath;
  let gzip;
  let mimeType;
  let piecesTgzPath;
  let pageTgzPath;
  let cleanFile;

  this.timeout(t.timeout);

  after(async function() {
    await cleanData([ attachmentPath, exportsPath ]);
    await t.destroy(apos);
  });

  before(async function() {
    apos = await t.create({
      root: module,
      testModule: true,
      modules: getAppConfig()
    });

    attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
    exportsPath = path.join(apos.rootDir, 'public/uploads/exports');
    importExportManager = apos.modules['@apostrophecms/import-export'];
    importExportManager.removeExportFileFromUploadFs = () => {};
    gzip = importExportManager.formats.gzip;
    mimeType = gzip.allowedTypes[0];
    cleanFile = importExportManager.cleanFile;
    importExportManager.cleanFile = () => {};

    await insertAdminUser(apos);
    await insertPieces(apos);
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

    const exportPath = await gzip.input(path.join(exportsPath, fileName));

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

    await cleanFile(exportPath);
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
    const exportPath = await gzip.input(piecesTgzPath);

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

    await cleanFile(exportPath);
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
    const exportPath = await gzip.input(pageTgzPath);

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
    await cleanFile(exportPath);
  });

  it('should import pieces with related documents from a compressed file', async function() {
    const req = apos.task.getReq();

    await deletePieces(apos);
    await deletePage(apos);
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
    await cleanFile(piecesTgzPath.replace(gzip.allowedExtension, ''));
  });

  it('should return duplicates pieces when already existing and override them', async function() {
    const req = apos.task.getReq();

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
      exportPath,
      jobId,
      notificationId
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
      exportPath,
      jobId,
      notificationId
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
        'article2', 'article1',
        'article2', 'article1',
        'topic1', 'topic2',
        'topic1', 'topic2'
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
    await cleanFile(piecesTgzPath.replace(gzip.allowedExtension, ''));
  });

  it('should import page and related documents', async function() {
    const req = apos.task.getReq();

    await deletePieces(apos);
    await deletePage(apos);
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
    await cleanFile(pageTgzPath.replace(gzip.allowedExtension, ''));
  });

  it('should return existing duplicated docs during page import and override them', async function() {
    const req = apos.task.getReq();

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
      exportPath,
      jobId,
      notificationId
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
      exportPath,
      jobId,
      notificationId
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
        'article2',
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

    await cleanFile(pageTgzPath.replace(gzip.allowedExtension, ''));
  });

  it('should not override attachment if associated document is not imported', async function() {
    const req = apos.task.getReq();

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
      exportPath,
      jobId,
      notificationId
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
      exportPath,
      jobId,
      notificationId
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
        'article2',
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

    await cleanFile(pageTgzPath.replace(gzip.allowedExtension, ''));
  });

  describe('override locales', function() {
    let notify;
    let getFilesData;
    let readExportFile;
    let rewriteDocsWithCurrentLocale;
    let insertDocs;

    this.beforeEach(async function() {
      notify = apos.notify;
      getFilesData = apos.modules['@apostrophecms/import-export'].getFilesData;
      readExportFile = apos.modules['@apostrophecms/import-export'].readExportFile;
      rewriteDocsWithCurrentLocale = apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale;
      insertDocs = apos.modules['@apostrophecms/import-export'].insertDocs;

      await deletePieces(apos);
      await deletePage(apos);
      await deleteAttachments(apos, attachmentPath);
    });

    this.afterEach(function() {
      apos.notify = notify;
      apos.modules['@apostrophecms/import-export'].getFilesData = getFilesData;
      apos.modules['@apostrophecms/import-export'].readExportFile = readExportFile;
      apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = rewriteDocsWithCurrentLocale;
      apos.modules['@apostrophecms/import-export'].insertDocs = insertDocs;
    });

    it('should import pieces with related documents from the extracted export path when provided', async function() {
      const req = apos.task.getReq({
        body: {}
      });

      apos.modules['@apostrophecms/import-export'].readExportFile = async () => {
        throw new Error('should not have been called');
      };
      apos.modules['@apostrophecms/import-export'].getFilesData = async exportPath => {
        assert.equal(exportPath, '/custom/extracted-export-path');

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

      await importExportManager.import({
        ...req,
        body: {
          exportPath: '/custom/extracted-export-path'
        }
      });
    });

    describe('when the site has only one locale', function() {
      it('should not notify even if the locale found in docs is different than the req one', async function() {
        const req = apos.task.getReq({
          locale: 'en',
          body: {}
        });

        apos.modules['@apostrophecms/import-export'].readExportFile = async req => {
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
          throw new Error('should not have been called');
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
          if (options?.event?.name === 'import-locale-differs') {
            throw new Error('should not have been called with event "import-locale-differ"');
          }
          return {};
        };

        await importExportManager.import(req);
      });
    });

    describe('when the site has multiple locales', function() {
      let _apos;
      let _importExportManager;

      before(async function () {
        _apos = await t.create({
          root: module,
          testModule: true,
          modules: getAppConfig({
            '@apostrophecms/express': {
              options: {
                session: { secret: 'supersecret' },
                port: 3001
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

        _importExportManager = _apos.modules['@apostrophecms/import-export'];
      });

      after(async function() {
        await t.destroy(_apos);
      });

      it('should not notify if the locale found in docs is not different than the req one', async function() {
        const req = _apos.task.getReq({
          body: {},
          locale: 'fr'
        });

        _apos.modules['@apostrophecms/import-export'].readExportFile = async req => {
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

        _apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = () => {
          throw new Error('should not have been called');
        };
        _apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
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
        _apos.notify = async (req, message, options) => {
          if (options?.event?.name === 'import-locale-differs') {
            throw new Error('should not have been called with event "import-locale-differ"');
          }
          return {};
        };

        await _importExportManager.import(req);
      });

      it('should notify if the locale found in docs is different than the req one', async function() {
        const req = _apos.task.getReq({
          body: {},
          locale: 'en'
        });

        _apos.modules['@apostrophecms/import-export'].getFilesData = async exportPath => {
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

        _apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = () => {
          throw new Error('should not have been called');
        };
        _apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
          throw new Error('should not have been called');
        };
        _apos.notify = async (req, message, options) => {
          assert.equal(options.event.name, 'import-locale-differs');
        };

        await _importExportManager.import(req);
      });

      it('should replace the docs locales if the locale found in docs is different than the req one, when the `overrideLocale` param is provided', async function() {
        const req = _apos.task.getReq({
          body: {
            overrideLocale: true
          },
          locale: 'en'
        });

        _apos.modules['@apostrophecms/import-export'].getFilesData = async exportPath => {
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

        _apos.modules['@apostrophecms/import-export'].rewriteDocsWithCurrentLocale = (req, docs) => {
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
        _apos.modules['@apostrophecms/import-export'].insertDocs = async (req, docs) => {
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
        _apos.notify = async (req, message, options) => {
          if (options?.event?.name === 'import-locale-differs') {
            throw new Error('should not have been called with event "import-locale-differ"');
          }
          return {};
        };

        await _importExportManager.import(req);
      });
    });

    it('should find the first locale among the docs that is different from the one in req', async function() {
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

    it('should rewrite the docs locale with the one in req the first locale among the docs that is different from the one in req', async function() {
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

async function deletePieces(apos) {
  await apos.doc.db.deleteMany({ type: /default-page|article|topic|@apostrophecms\/image/ });
}

async function deletePage(apos) {
  await apos.doc.db.deleteMany({ title: 'page1' });
}

async function deleteAttachments(apos, attachmentPath) {
  await apos.attachment.db.deleteMany({});
  await cleanData([ attachmentPath ]);
}

async function insertPieces(apos) {
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
        session: { secret: 'supersecret' },
        port: 3000
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
