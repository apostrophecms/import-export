const assert = require('assert').strict;
const path = require('path');
const t = require('apostrophe/test-lib/util.js');
const { getAppConfig } = require('./util/index.js');

describe('@apostrophecms/import-export:import-page', function () {
  let apos;
  let exportsPath;

  this.timeout(t.timeout);

  beforeEach(async function() {
    await t.destroy(apos);

    const appConfig = getAppConfig();
    apos = await t.create({
      root: module,
      testModule: true,
      modules: {
        ...appConfig,
        '@apostrophecms/page': {
          options: {
            park: [],
            types: [
              {
                name: '@apostrophecms/home-page',
                label: 'Home'
              },
              {
                name: 'test-page',
                label: 'Test Page'
              }
            ]
          }
        },
        'test-page': {
          extend: '@apostrophecms/page-type'
        }
      }
    });

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
          rank: 1,
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
          rank: 1,
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
          level: 1,
          lowSearchText: importedDocs.at(2).lowSearchText,
          metaType: 'doc',
          modified: false,
          path: `${homeDraft.aposDocId}/${importedDocs.at(0).aposDocId}/${importedDocs.at(2).aposDocId}`,
          rank: 1,
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
          level: 1,
          lowSearchText: importedDocs.at(3).lowSearchText,
          metaType: 'doc',
          orphan: false,
          path: `${homePublished.aposDocId}/${importedDocs.at(1).aposDocId}/${importedDocs.at(3).aposDocId}`,
          parked: null,
          parkedId: null,
          rank: 1,
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

  // TODO: re-import same tarball twice
  it.skip('should import pages from same tarball twice without issues', async function () {
    const actual = {};
    const expected = {};

    assert.deepEqual(actual, expected);
  });
});
