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

    const exportReq = apos.task.getReq({
      body: {
        _ids: ids.map(({ _id }) => _id),
        extension: 'gzip',
        relatedTypes: [ '@apostrophecms/home-page', 'test-page', '@apostrophecms/image', 'topic' ],
        type: req.t('apostrophe:pages')
      }
    });
    const { url } = await apos.modules['@apostrophecms/import-export'].export(exportReq, manager);
    const fileName = path.basename(url);
    const exportFilePath = path.join(exportsPath, fileName);

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
      .find({ type: /@apostrophecms\/home-page|test-page|article|topic|@apostrophecms\/image|@apostrophecms\/image-tag/ })
      .toArray();

    const actual = {
      docs: importedDocs
    };
    const expected = {
      docs: [
        {
          _id: 'l369i5ytqnraeretfc6952rv:en:draft',
          aposDocId: 'l369i5ytqnraeretfc6952rv',
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: '2024-08-29T17:28:22.085Z',
          createdAt: '2024-08-29T17:28:22.085Z',
          highSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          highSearchWords: [
            'level',
            '3',
            'page',
            '1',
            '2',
            'test'
          ],
          lastPublishedAt: '2024-08-29T17:28:22.136Z',
          level: 3,
          lowSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          metaType: 'doc',
          modified: false,
          path: 'gio0gpclmnto7otebzw69kug/m9dhwnk492y1suxpl9mg3glx/sf7cvu7dt5582s2bbmfan7yy/l369i5ytqnraeretfc6952rv',
          rank: 1,
          searchSummary: '',
          slug: '/level-2-page-1',
          title: 'Level 2 Page 1',
          titleSortified: 'level 2 page 1',
          type: 'test-page',
          updatedAt: '2024-08-29T17:28:22.085Z'
        },
        {
          _id: 'l369i5ytqnraeretfc6952rv:en:published',
          aposDocId: 'l369i5ytqnraeretfc6952rv',
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: '2024-08-29T17:28:22.085Z',
          createdAt: '2024-08-29T17:28:22.085Z',
          highSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          highSearchWords: [
            'level',
            '3',
            'page',
            '1',
            '2',
            'test'
          ],
          lastPublishedAt: '2024-08-29T17:28:22.136Z',
          level: 3,
          lowSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          metaType: 'doc',
          modified: false,
          path: 'gio0gpclmnto7otebzw69kug/m9dhwnk492y1suxpl9mg3glx/sf7cvu7dt5582s2bbmfan7yy/l369i5ytqnraeretfc6952rv',
          rank: 1,
          searchSummary: '',
          slug: '/level-2-page-1',
          title: 'Level 2 Page 1',
          titleSortified: 'level 2 page 1',
          type: 'test-page',
          updatedAt: '2024-08-29T17:28:22.085Z'
        },
        {
          _id: 'l369i5ytqnraeretfc6952rv:en:draft',
          aposDocId: 'l369i5ytqnraeretfc6952rv',
          aposLocale: 'en:draft',
          aposMode: 'draft',
          archived: false,
          cacheInvalidatedAt: '2024-08-29T17:28:22.085Z',
          createdAt: '2024-08-29T17:28:22.085Z',
          highSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          highSearchWords: [
            'level',
            '3',
            'page',
            '1',
            '2',
            'test'
          ],
          lastPublishedAt: '2024-08-29T17:28:22.136Z',
          level: 2,
          lowSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          metaType: 'doc',
          modified: false,
          path: 'gio0gpclmnto7otebzw69kug/m9dhwnk492y1suxpl9mg3glx/sf7cvu7dt5582s2bbmfan7yy/l369i5ytqnraeretfc6952rv',
          rank: 1,
          searchSummary: '',
          slug: '/level-1-page-1/level-2-page-1/level-3-page-1/level-4-page-1',
          title: 'Level 4 Page 1',
          titleSortified: 'level 4 page 1',
          type: 'test-page',
          updatedAt: '2024-08-29T17:28:22.085Z'
        },
        {
          _id: 'l369i5ytqnraeretfc6952rv:en:published',
          aposDocId: 'l369i5ytqnraeretfc6952rv',
          aposLocale: 'en:published',
          aposMode: 'published',
          archived: false,
          cacheInvalidatedAt: '2024-08-29T17:28:22.085Z',
          createdAt: '2024-08-29T17:28:22.085Z',
          highSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          highSearchWords: [
            'level',
            '3',
            'page',
            '1',
            '2',
            'test'
          ],
          lastPublishedAt: '2024-08-29T17:28:22.136Z',
          level: 2,
          lowSearchText: 'level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 level 3 page 1 level 1 page 1 level 2 page 1 level 3 page 1 test page',
          metaType: 'doc',
          modified: false,
          path: 'gio0gpclmnto7otebzw69kug/m9dhwnk492y1suxpl9mg3glx/sf7cvu7dt5582s2bbmfan7yy/l369i5ytqnraeretfc6952rv',
          rank: 1,
          searchSummary: '',
          slug: '/level-1-page-1/level-2-page-1/level-3-page-1/level-4-page-1',
          title: 'Level 4 Page 1',
          titleSortified: 'level 4 page 1',
          type: 'test-page',
          updatedAt: '2024-08-29T17:28:22.085Z'
        }
      ]
    };

    assert.deepEqual(actual, expected);
  });
});
