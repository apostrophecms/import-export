const assert = require('assert').strict;
const path = require('path');
const fs = require('fs/promises');
const t = require('apostrophe/test-lib/util.js');
const { getAppConfig } = require('./util/index.js');

const server = {
  start: () => {
    const appConfig = getAppConfig();

    return t.create({
      root: module,
      testModule: true,
      modules: {
        ...appConfig,
        '@apostrophecms/page': {
          options: {
            park: [
              {
                parkedId: 'custom',
                type: 'custom-page',
                _defaults: {
                  slug: '/custom',
                  title: 'Custom',
                }
              }
            ],
            types: [
              {
                name: '@apostrophecms/home-page',
                label: 'Home'
              },
              {
                name: 'test-page',
                label: 'Test Page'
              },
              {
                name: 'custom-page',
                label: 'Custom Page'
              }
            ]
          }
        },
        'custom-page': {
          extend: '@apostrophecms/page-type'
        },
        'test-page': {
          extend: '@apostrophecms/page-type'
        }
      }
    });
  },
  stop: async (apos) => {
    await t.destroy(apos);
  }
}
describe('@apostrophecms/import-export:import-page', function () {
  let apos;
  let exportsPath;

  this.timeout(t.timeout);

  beforeEach(async function() {
    await server.stop(apos);
    apos = await server.start();
    exportsPath = path.join(apos.rootDir, 'public/uploads/exports');

    const req = apos.task.getReq({ mode: 'draft' });

    // TODO: add rich text with link to pages and images with tags
    const level1Page1 = await apos.page.insert(
      req,
      '_home',
      'lastChild',
      {
        title: 'Level 1 Page 1',
        type: 'test-page',
        slug: '/level-1-page-1'
      }
    );
    const level1Page2 = await apos.page.insert(
      req,
      '_home',
      'lastChild',
      {
        title: 'Level 1 Page 2',
        type: 'test-page',
        slug: '/level-1-page-2'
      }
    );
    const level1Page3 = await apos.page.insert(
      req,
      '_home',
      'lastChild',
      {
        title: 'Level 1 Page 3',
        type: 'test-page',
        slug: '/level-1-page-3'
      }
    );
    const level2Page1 = await apos.page.insert(
      req,
      level1Page1._id,
      'lastChild',
      {
        title: 'Level 2 Page 1',
        type: 'test-page',
        slug: '/level-1-page-1/level-2-page-1'
      }
    );
    const level3Page1 = await apos.page.insert(
      req,
      level2Page1._id,
      'lastChild',
      {
        title: 'Level 3 Page 1',
        type: 'test-page',
        slug: '/level-1-page-1/level-2-page-1/level-3-page-1'
      }
    );
    const level4Page1 = await apos.page.insert(
      req,
      level3Page1._id,
      'lastChild',
      {
        title: 'Level 4 Page 1',
        type: 'test-page',
        slug: '/level-1-page-1/level-2-page-1/level-3-page-1/level-4-page-1'
      }
    );
    const level5Page1 = await apos.page.insert(
      req,
      level4Page1._id,
      'lastChild',
      {
        title: 'Level 5 Page 1',
        type: 'test-page',
        slug: '/level-1-page-1/level-2-page-1/level-3-page-1/level-4-page-1/level-5-page-1'
      }
    );
    const level5Page2 = await apos.page.insert(
      req,
      level4Page1._id,
      'lastChild',
      {
        title: 'Level 5 Page 2',
        type: 'test-page',
        slug: '/level-1-page-1/level-2-page-1/level-3-page-1/level-4-page-1/level-5-page-2'
      }
    );

    await apos.page.publish(req, level1Page1);
    await apos.page.publish(req, level1Page2);
    await apos.page.publish(req, level1Page3);
    await apos.page.publish(req, level2Page1);
    await apos.page.publish(req, level3Page1);
    await apos.page.publish(req, level4Page1);
    await apos.page.publish(req, level5Page1);
    await apos.page.publish(req, level5Page2);
  });

  afterEach(async function() {
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image' });
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image-tag' });
    await apos.doc.db.deleteMany({ type: 'test-page' });
  });

  it('should import pages', async function () {
    const req = apos.task.getReq({ mode: 'draft' });

    const manager = apos.page;
    const ids = await manager
      .find(
        req,
        {
          title: {
            $in: [
              'Level 2 Page 1',
              'Level 4 Page 1'
            ]
          }
        },
        {
          project: {
            _id: 1
          }
        }
      )
      .toArray();

    // export
    const exportReq = apos.task.getReq({
      body: {
        _ids: ids.map(({ _id }) => _id),
        extension: 'gzip',
        relatedTypes: [ '@apostrophecms/home-page', '@apostrophecms/image', '@apostrophecms/image-tag', 'test-page' ],
        type: req.t('apostrophe:pages')
      }
    });
    const { url } = await apos.modules['@apostrophecms/import-export'].export(exportReq, manager);
    const fileName = path.basename(url);
    const exportFilePath = path.join(exportsPath, fileName);

    // cleanup
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image' });
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image-tag' });
    await apos.doc.db.deleteMany({ type: 'test-page' });

    // import
    const mimeType = apos.modules['@apostrophecms/import-export'].formats.gzip.allowedTypes.at(0);
    const importReq = apos.task.getReq({
      body: {},
      files: {
        file: {
          path: exportFilePath,
          type: mimeType
        }
      }
    });
    await apos.modules['@apostrophecms/import-export'].import(importReq);

    const importedDocs = await apos.doc.db
      .find({ type: /@apostrophecms\/image|@apostrophecms\/image-tag|test-page/ })
      .sort({
        type: 1,
        title: 1,
        aposMode: 1
      })
      .toArray();
    const homeDraft = await apos.page.find(apos.task.getReq({ mode: 'draft' }), { slug: '/' }).toObject();
    const homePublished = await apos.page.find(apos.task.getReq({ mode: 'published' }), { slug: '/' }).toObject();

    const actual = {
      docs: importedDocs
    };
    const expected = {
      docs: [
        {
          _id: importedDocs.at(0)._id,
          aposDocId: importedDocs.at(0).aposDocId,
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(0).cacheInvalidatedAt,
          createdAt: importedDocs.at(0).createdAt,
          highSearchText: importedDocs.at(0).highSearchText,
          highSearchWords: [
            'level',
            '2',
            'page',
            '1',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(0).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(0).lowSearchText,
          metaType: 'doc',
          modified: false,
          path: `${homeDraft.aposDocId}/${importedDocs.at(0).aposDocId}`,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1',
          title: 'Level 2 Page 1',
          titleSortified: 'level 2 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(0).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(1)._id,
          aposDocId: importedDocs.at(1).aposDocId,
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(1).cacheInvalidatedAt,
          createdAt: importedDocs.at(1).createdAt,
          highSearchText: importedDocs.at(1).highSearchText,
          highSearchWords: [
            'level',
            '2',
            'page',
            '1',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(1).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(1).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${importedDocs.at(1).aposDocId}`,
          parked: null,
          parkedId: null,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1',
          title: 'Level 2 Page 1',
          titleSortified: 'level 2 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(1).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(2)._id,
          aposDocId: importedDocs.at(2).aposDocId,
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(2).cacheInvalidatedAt,
          createdAt: importedDocs.at(2).createdAt,
          highSearchText: importedDocs.at(2).highSearchText,
          highSearchWords: [
            'level',
            '4',
            'page',
            '1',
            '2',
            '3',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(2).lastPublishedAt,
          level: 2,
          lowSearchText: importedDocs.at(2).lowSearchText,
          metaType: 'doc',
          modified: false,
          path: `${homeDraft.aposDocId}/${importedDocs.at(0).aposDocId}/${importedDocs.at(2).aposDocId}`,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1/level-4-page-1',
          title: 'Level 4 Page 1',
          titleSortified: 'level 4 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(2).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(3)._id,
          aposDocId: importedDocs.at(3).aposDocId,
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(3).cacheInvalidatedAt,
          createdAt: importedDocs.at(3).createdAt,
          highSearchText: importedDocs.at(3).highSearchText,
          highSearchWords: [
            'level',
            '4',
            'page',
            '1',
            '2',
            '3',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(3).lastPublishedAt,
          level: 2,
          lowSearchText: importedDocs.at(3).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${importedDocs.at(1).aposDocId}/${importedDocs.at(3).aposDocId}`,
          parked: null,
          parkedId: null,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1/level-4-page-1',
          title: 'Level 4 Page 1',
          titleSortified: 'level 4 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(3).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        }
      ]
    };

    assert.deepEqual(actual, expected);
  });

  it('should import pages from same tarball twice without issues', async function () {
    const req = apos.task.getReq({ mode: 'draft' });

    const manager = apos.page;
    const ids = await manager
      .find(
        req,
        {
          title: {
            $in: [
              'Level 2 Page 1',
              'Level 4 Page 1'
            ]
          }
        },
        {
          project: {
            _id: 1
          }
        }
      )
      .toArray();

    // export
    const exportReq = apos.task.getReq({
      body: {
        _ids: ids.map(({ _id }) => _id),
        extension: 'gzip',
        relatedTypes: [ '@apostrophecms/home-page', '@apostrophecms/image', '@apostrophecms/image-tag', 'test-page' ],
        type: req.t('apostrophe:pages')
      }
    });
    const { url } = await apos.modules['@apostrophecms/import-export'].export(exportReq, manager);
    const fileName = path.basename(url);
    const exportFilePath = path.join(exportsPath, fileName);
    const exportFilePathDuplicate = exportFilePath.concat('-duplicate.tar.gz');
    await fs.copyFile(exportFilePath, exportFilePathDuplicate);

    // cleanup
    await apos.doc.db.deleteMany({ type: '@apostrophecms/home-page' });
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image' });
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image-tag' });
    await apos.doc.db.deleteMany({ type: 'custom-page' });
    await apos.doc.db.deleteMany({ type: 'test-page' });
    await server.stop(apos);
    apos = await server.start();

    // import
    const mimeType = apos.modules['@apostrophecms/import-export'].formats.gzip.allowedTypes.at(0);
    const importReq = apos.task.getReq({
      body: {},
      files: {
        file: {
          path: exportFilePath,
          type: mimeType
        }
      }
    });
    const importDuplicateReq = apos.task.getReq({
      body: {},
      files: {
        file: {
          path: exportFilePathDuplicate,
          type: mimeType
        }
      }
    });
    await apos.modules['@apostrophecms/import-export'].import(importReq);
    await apos.modules['@apostrophecms/import-export'].import(importDuplicateReq);

    const importedDocs = await apos.doc.db
      .find({ type: /@apostrophecms\/image|@apostrophecms\/image-tag|test-page/ })
      .sort({
        type: 1,
        title: 1,
        aposMode: 1
      })
      .toArray();
    const homeDraft = await apos.page.find(apos.task.getReq({ mode: 'draft' }), { slug: '/' }).toObject();
    const homePublished = await apos.page.find(apos.task.getReq({ mode: 'published' }), { slug: '/' }).toObject();

    const actual = {
      docs: importedDocs
    };
    const expected = {
      docs: [
        {
          _id: importedDocs.at(0)._id,
          aposDocId: importedDocs.at(0).aposDocId,
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(0).cacheInvalidatedAt,
          createdAt: importedDocs.at(0).createdAt,
          highSearchText: importedDocs.at(0).highSearchText,
          highSearchWords: [
            'level',
            '2',
            'page',
            '1',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(0).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(0).lowSearchText,
          metaType: 'doc',
          modified: false,
          path: `${homeDraft.aposDocId}/${importedDocs.at(0).aposDocId}`,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1',
          title: 'Level 2 Page 1',
          titleSortified: 'level 2 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(0).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(1)._id,
          aposDocId: importedDocs.at(1).aposDocId,
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(1).cacheInvalidatedAt,
          createdAt: importedDocs.at(1).createdAt,
          highSearchText: importedDocs.at(1).highSearchText,
          highSearchWords: [
            'level',
            '2',
            'page',
            '1',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(1).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(1).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${importedDocs.at(1).aposDocId}`,
          parked: null,
          parkedId: null,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1',
          title: 'Level 2 Page 1',
          titleSortified: 'level 2 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(1).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(2)._id,
          aposDocId: importedDocs.at(2).aposDocId,
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(2).cacheInvalidatedAt,
          createdAt: importedDocs.at(2).createdAt,
          highSearchText: importedDocs.at(2).highSearchText,
          highSearchWords: [
            'level',
            '4',
            'page',
            '1',
            '2',
            '3',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(2).lastPublishedAt,
          level: 2,
          lowSearchText: importedDocs.at(2).lowSearchText,
          metaType: 'doc',
          modified: false,
          path: `${homeDraft.aposDocId}/${importedDocs.at(0).aposDocId}/${importedDocs.at(2).aposDocId}`,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1/level-4-page-1',
          title: 'Level 4 Page 1',
          titleSortified: 'level 4 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(2).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(3)._id,
          aposDocId: importedDocs.at(3).aposDocId,
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(3).cacheInvalidatedAt,
          createdAt: importedDocs.at(3).createdAt,
          highSearchText: importedDocs.at(3).highSearchText,
          highSearchWords: [
            'level',
            '4',
            'page',
            '1',
            '2',
            '3',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(3).lastPublishedAt,
          level: 2,
          lowSearchText: importedDocs.at(3).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${importedDocs.at(1).aposDocId}/${importedDocs.at(3).aposDocId}`,
          parked: null,
          parkedId: null,
          rank: 0,
          searchSummary: '',
          slug: '/level-2-page-1/level-4-page-1',
          title: 'Level 4 Page 1',
          titleSortified: 'level 4 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(3).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        }
      ]
    };

    assert.deepEqual(actual, expected);
  });

  it.only('should import pages with existing parkedId and children', async function () {
    const req = apos.task.getReq({ mode: 'draft' });

    const manager = apos.page;
    const customPage = await manager.find(req, { slug: '/custom' }).toObject();
    const customLevel2Page1 = await manager.insert(
      req,
      customPage._id,
      'lastChild',
      {
        title: 'Custom Level 2 Page 1',
        type: 'test-page',
        slug: '/custom/custom-level-2-page-1'
      }
    );
    const customLevel3Page1 = await manager.insert(
      req,
      customLevel2Page1._id,
      'lastChild',
      {
        title: 'Custom Level 3 Page 1',
        type: 'test-page',
        slug: '/custom/custom-level-2-page-1/custom-level-3-page-1'
      }
    );
    await manager.publish(req, customLevel2Page1);
    await manager.publish(req, customLevel3Page1);

    const ids = await manager
      .find(
        req,
        {
          title: {
            $in: [
              'Custom',
              'Custom Level 3 Page 1'
            ]
          }
        },
        {
          project: {
            _id: 1
          }
        }
      )
      .toArray();

    // export
    const exportReq = apos.task.getReq({
      body: {
        _ids: ids.map(({ _id }) => _id),
        extension: 'gzip',
        relatedTypes: [ '@apostrophecms/home-page', '@apostrophecms/image', '@apostrophecms/image-tag', 'custom-page', 'test-page' ],
        type: req.t('apostrophe:pages')
      }
    });
    const { url } = await apos.modules['@apostrophecms/import-export'].export(exportReq, manager);
    const fileName = path.basename(url);
    const exportFilePath = path.join(exportsPath, fileName);

    // cleanup
    await apos.doc.db.deleteMany({ type: '@apostrophecms/home-page' });
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image' });
    await apos.doc.db.deleteMany({ type: '@apostrophecms/image-tag' });
    await apos.doc.db.deleteMany({ type: 'test-page' });
    await apos.doc.db.deleteMany({ type: 'custom-page' });
    await server.stop(apos);
    apos = await server.start();

    const customDraft = await apos.page.find(apos.task.getReq({ mode: 'draft' }), { slug: '/custom' }).toObject();
    const customPublished = await apos.page.find(apos.task.getReq({ mode: 'published' }), { slug: '/custom' }).toObject();
    const newCustomDraft = await apos.page.update(apos.task.getReq({ mode: 'draft' }), { ...customDraft, title: 'New Custom' });
    await apos.page.publish(apos.task.getReq({ mode: 'draft' }), newCustomDraft);

    // import
    const mimeType = apos.modules['@apostrophecms/import-export'].formats.gzip.allowedTypes.at(0);
    const importReq = apos.task.getReq({
      body: {},
      files: {
        file: {
          path: exportFilePath,
          type: mimeType
        }
      }
    });
    const {
      duplicatedDocs,
      importedAttachments,
      exportPathId,
      jobId,
      notificationId,
      formatLabel
    } = await apos.modules['@apostrophecms/import-export'].import(importReq);
    const importDuplicateReq = apos.task.getReq({
      body: {
        docIds: duplicatedDocs.map(({ aposDocId }) => aposDocId),
        replaceDocIds: duplicatedDocs.map(({ aposDocId, replaceId }) => [ aposDocId, replaceId ]),
        importedAttachments,
        exportPathId,
        jobId,
        notificationId,
        formatLabel
      }
    })
    await await apos.modules['@apostrophecms/import-export'].overrideDuplicates(importDuplicateReq);

    const importedDocs = await apos.doc.db
      .find({ type: /@apostrophecms\/image|@apostrophecms\/image-tag|custom-page|test-page/ })
      .sort({
        type: 1,
        title: 1,
        aposMode: 1
      })
      .toArray();
    const homeDraft = await apos.page.find(apos.task.getReq({ mode: 'draft' }), { slug: '/' }).toObject();
    const homePublished = await apos.page.find(apos.task.getReq({ mode: 'published' }), { slug: '/' }).toObject();

    const actual = {
      docs: importedDocs
    };
    const expected = {
      docs: [
        {
          _id: importedDocs.at(0)._id,
          aposDocId: importedDocs.at(0).aposDocId,
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(0).cacheInvalidatedAt,
          createdAt: importedDocs.at(0).createdAt,
          highSearchText: importedDocs.at(0).highSearchText,
          highSearchWords: [
            'custom',
            'page',
            'public'
          ],
          lastPublishedAt: importedDocs.at(0).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(0).lowSearchText,
          metaType: 'doc',
          orphan: false,
          parked: [
            'parkedId',
            'type'
          ],
          parkedId: 'custom',
          path: `${homeDraft.aposDocId}/${customDraft.aposDocId}`,
          rank: 0,
          searchSummary: '',
          slug: '/custom',
          title: 'Custom',
          titleSortified: 'custom',
          type: 'custom-page',
          updatedAt: importedDocs.at(0).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(1)._id,
          aposDocId: importedDocs.at(1).aposDocId,
          aposLocale: 'en:previous',
          aposMode: 'previous',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(1).cacheInvalidatedAt,
          createdAt: importedDocs.at(1).createdAt,
          highSearchText: importedDocs.at(1).highSearchText,
          highSearchWords: [
            'custom',
            'page',
            'public'
          ],
          lastPublishedAt: importedDocs.at(1).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(1).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${customPublished.aposDocId}`,
          parked: [
            'parkedId',
            'type'
          ],
          parkedId: 'custom',
          rank: 0,
          searchSummary: '',
          slug: `/custom-deduplicate-${importedDocs.at(1).aposDocId}`,
          title: 'Custom',
          titleSortified: 'custom',
          type: 'custom-page',
          updatedAt: importedDocs.at(1).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(2)._id,
          aposDocId: importedDocs.at(2).aposDocId,
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(2).cacheInvalidatedAt,
          createdAt: importedDocs.at(2).createdAt,
          highSearchText: importedDocs.at(2).highSearchText,
          highSearchWords: [
            'custom',
            'page',
            'public'
          ],
          lastPublishedAt: importedDocs.at(2).lastPublishedAt,
          level: 1,
          lowSearchText: importedDocs.at(2).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${customPublished.aposDocId}`,
          parked: [
            'parkedId',
            'type'
          ],
          parkedId: 'custom',
          rank: 0,
          searchSummary: '',
          slug: '/custom',
          title: 'Custom',
          titleSortified: 'custom',
          type: 'custom-page',
          updatedAt: importedDocs.at(2).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(3)._id,
          aposDocId: importedDocs.at(3).aposDocId,
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(3).cacheInvalidatedAt,
          createdAt: importedDocs.at(3).createdAt,
          highSearchText: importedDocs.at(3).highSearchText,
          highSearchWords: [
            'custom',
            'level',
            '3',
            'page',
            '1',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(3).lastPublishedAt,
          level: 2,
          lowSearchText: importedDocs.at(3).lowSearchText,
          metaType: 'doc',
          modified: false,
          path: `${homeDraft.aposDocId}/${customDraft.aposDocId}/${importedDocs.at(3).aposDocId}`,
          rank: 2,
          searchSummary: '',
          slug: '/custom/custom-level-3-page-1',
          title: 'Custom Level 3 Page 1',
          titleSortified: 'custom level 3 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(3).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        },
        {
          _id: importedDocs.at(4)._id,
          aposDocId: importedDocs.at(4).aposDocId,
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: importedDocs.at(4).cacheInvalidatedAt,
          createdAt: importedDocs.at(4).createdAt,
          highSearchText: importedDocs.at(4).highSearchText,
          highSearchWords: [
            'custom',
            'level',
            '3',
            'page',
            '1',
            'test',
            'public'
          ],
          lastPublishedAt: importedDocs.at(4).lastPublishedAt,
          level: 2,
          lowSearchText: importedDocs.at(4).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${customPublished.aposDocId}/${importedDocs.at(4).aposDocId}`,
          parked: null,
          parkedId: null,
          rank: 0,
          searchSummary: '',
          slug: '/custom/custom-level-3-page-1',
          title: 'Custom Level 3 Page 1',
          titleSortified: 'custom level 3 page 1',
          type: 'test-page',
          updatedAt: importedDocs.at(4).updatedAt,
          updatedBy: {
            _id: null, // TODO: should be my user id
            title: 'System Task',
            username: null
          },
          visibility: 'public'
        }
      ]
    };

    //assert.deepEqual(actual, expected);
    assert.deepEqual(
        actual.docs.slice(0, 1),
      expected.docs.slice(0, 1),
    );
  });

  // TODO: treat parkedId as duplicate
});