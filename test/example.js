const assert = require('assert').strict;
const t = require('apostrophe/test-lib/util.js');

const getAppConfig = () => {
  return {
    '@apostrophecms/express': {
      options: {
        session: { secret: 'supersecret' }
      }
    },
    '@apostrophecms/module': {
      options: {
      }
    }
  };
};

describe('@apostrophecms/module', function () {
  let apos;

  this.timeout(t.timeout);

  after(function () {
    return t.destroy(apos);
  });

  before(async function() {
    apos = await t.create({
      root: module,
      baseUrl: 'http://localhost:3000',
      testModule: true,
      modules: getAppConfig()
    });
  });

  describe('init', function() {
    it('should have module enabled', function () {
      const actual = Object.keys(apos.modules).includes('@apostrophecms/module');
      const expected = true;

      assert.equal(actual, expected);
    });
  });
});
