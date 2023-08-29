const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');
const fs = require('fs/promises');
const { createReadStream, existsSync } = require('fs');
const path = require('path');
const FormData = require('form-data');
const { execSync } = require('child_process');

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

  it('should generate a zip file without related documents', async function () {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'zip'
    };
    const { url } = await apos.modules['@apostrophecms/import-export'].export(req, apos.article);
    const fileName = path.basename(url);

    const { zipPath, extractPath } = await unzip(tempPath, exportPath, fileName);

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

  it('should generate a zip file with related documents', async function () {
    const req = apos.task.getReq();
    const articles = await apos.article.find(req).toArray();

    req.body = {
      _ids: articles.map(({ _id }) => _id),
      extension: 'zip',
      relatedTypes: [ '@apostrophecms/image', 'topic' ]
    };

    const { url } = await apos.modules['@apostrophecms/import-export'].export(req, apos.article);
    const fileName = path.basename(url);
    const pathToZip = path.join(exportPath, fileName);
    const pathToExtracted = path.join(tempPath, fileName.replace('.zip', ''));
  });
});

// TODO replace with same system used to extract compressed filse on server
// this method requires the server running the tests to have the unzip command availabe
function unzip(tempPath, exportPath, fileName) {
  const zipPath = path.join(exportPath, fileName);
  const extractPath = path.join(tempPath, fileName.replace('.zip', ''));

  try {
    execSync(`unzip ${zipPath} -d ${extractPath}`);

    return {
      zipPath,
      extractPath
    };
  } catch (err) {
    assert(!err);
  }
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
    _topics: [ topic2 ]
  });

  await apos.article.insert(req, {
    ...apos.article.newInstance(),
    title: 'article2',
    _topics: [ topic1 ]
  });

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
        alias: 'article'
      },
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
