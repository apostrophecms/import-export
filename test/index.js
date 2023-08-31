const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const fs = require('fs/promises');
const {
  createReadStream, existsSync, createWriteStream
} = require('fs');
const path = require('path');
const FormData = require('form-data');
const { execSync } = require('child_process');
/* const zlib = require('zlib'); */
const tar = require('tar');

describe('@apostrophecms/import-export', function () {
  let apos;
  let attachmentPath;
  let exportPath;
  let tempPath;

  this.timeout(t.timeout);

  after(async function() {
    await cleanData([ attachmentPath, exportPath, tempPath ]);
    await t.destroy(apos);
  });

  before(async function() {
    apos = await t.create({
      root: module,
      baseUrl: 'http://localhost:3000',
      testModule: true,
      modules: getAppConfig()
    });
    attachmentPath = path.join(apos.rootDir, 'public/uploads/attachments');
    exportPath = path.join(apos.rootDir, 'public/uploads/exports');
    tempPath = path.join(apos.rootDir, 'data/temp/exports');
    if (!existsSync(tempPath)) {
      await fs.mkdir(tempPath);
    }
    await insertAdminUser(apos);
    await insertPieces(apos);
  });

  it('should generate a zip file for pieces without related documents', async function () {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'gzip'
    };
    const { url } = await apos.modules['@apostrophecms/import-export'].export(req, apos.article);
    const fileName = path.basename(url);

    const extractPath = await unzip(tempPath, exportPath, fileName);

    const docsData = await fs.readFile(
      path.join(extractPath, 'aposDocs.json'),
      { encoding: 'utf8' }
    );

    const attachmentsData = await fs.readFile(
      path.join(extractPath, 'aposAttachments.json'),
      { encoding: 'utf8' }
    );

    const docs = JSON.parse(docsData);
    const attachments = JSON.parse(attachmentsData);

    const actual = {
      docsLength: docs.length,
      attachmentsLength: attachments.length
    };
    const expected = {
      docsLength: 4,
      attachmentsLength: 0
    };

    assert.deepEqual(actual, expected);
  });

  it('should generate a zip file for pieces with related documents', async function () {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();
    const { _id: attachmentId } = await apos.attachment.db.findOne({ name: 'test-image' });
    console.log('attachemntId', attachmentId);

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'gzip',
      relatedTypes: [ '@apostrophecms/image', 'topic' ]
    };

    const { url } = await apos.modules['@apostrophecms/import-export'].export(req, apos.article);
    const fileName = path.basename(url);

    const extractPath = await unzip(tempPath, exportPath, fileName);

    const docsData = await fs.readFile(
      path.join(extractPath, 'aposDocs.json'),
      { encoding: 'utf8' }
    );

    const attachmentsData = await fs.readFile(
      path.join(extractPath, 'aposAttachments.json'),
      { encoding: 'utf8' }
    );

    const attachmentFiles = await fs.readdir(path.join(extractPath, 'attachments'));

    const docs = JSON.parse(docsData);
    const attachments = JSON.parse(attachmentsData);

    const actual = {
      docsLength: docs.length,
      attachmentsLength: attachments.length,
      attachmentFiles
    };
    const expected = {
      docsLength: 8,
      attachmentsLength: 1,
      attachmentFiles: [ `${attachmentId}-test-image.jpg` ]
    };

    assert.deepEqual(actual, expected);
  });

  /* it.only('should generate a zip file for pages with related documents', async function () { */
  /*   const req = apos.task.getReq(); */
  /*   const pages = await apos.page.find(req).toArray(); */
  /**/
  /*   console.log('pages', pages); */
  /**/
  /*   return; */
  /*   req.body = { */
  /*     _ids: pages.map(({ _id }) => _id), */
  /*     extension: 'zip', */
  /*     relatedTypes: [ '@apostrophecms/image', 'topic' ] */
  /*   }; */
  /**/
  /*   const { url } = await apos.modules['@apostrophecms/import-export'].export(req, apos.article); */
  /*   const fileName = path.basename(url); */
  /**/
  /*   const extractPath = await unzip(tempPath, exportPath, fileName); */
  /**/
  /*   const docsData = await fs.readFile( */
  /*     path.join(extractPath, 'aposDocs.json'), */
  /*     { encoding: 'utf8' } */
  /*   ); */
  /**/
  /*   const attachmentsData = await fs.readFile( */
  /*     path.join(extractPath, 'aposAttachments.json'), */
  /*     { encoding: 'utf8' } */
  /*   ); */
  /**/
  /*   const attachmentFiles = await fs.readdir(path.join(extractPath, 'attachments')); */
  /**/
  /*   const docs = JSON.parse(docsData); */
  /*   const attachments = JSON.parse(attachmentsData); */
  /**/
  /*   const actual = { */
  /*     docsLength: docs.length, */
  /*     attachmentsLength: attachments.length, */
  /*     attachmentFiles */
  /*   }; */
  /*   const expected = { */
  /*     docsLength: 8, */
  /*     attachmentsLength: 1, */
  /*     attachmentFiles: [ 'cllxy7wzz000chomddduw429z-test-image.jpg' ] */
  /*   }; */
  /**/
  /*   assert.deepEqual(actual, expected); */
  /* }); */
});

async function unzip(tempPath, exportPath, fileName) {
  const zipPath = path.join(exportPath, fileName);
  const extractPath = path.join(tempPath, fileName.replace('.tar.gz', ''));

  if (!existsSync(extractPath)) {
    await fs.mkdir(extractPath);
  }

  return new Promise((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(tar.x({
        cwd: extractPath
      }))
      .on('error', reject)
      .on('close', () => resolve(extractPath));
  });
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

  await apos.article.insert(req, {
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

function getAppConfig() {
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
        alias: 'article'
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
    }
  };
}
