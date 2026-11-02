const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function cloudWith(fetchImpl) {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const context = { fetch: fetchImpl, localStorage: storage, navigator: { onLine: true }, Date, JSON, Error, encodeURIComponent };
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloud.js'), 'utf8');
  vm.runInNewContext(source + '\nthis.NihongoCloud = NihongoCloud;', context);
  return { cloud: new context.NihongoCloud(), storage };
}

function reply(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body === null ? '' : JSON.stringify(body),
    json: async () => body
  };
}

test('email code creates a persistent session and sends progress only as the signed-in user', async () => {
  const calls = [];
  const { cloud, storage } = cloudWith(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/otp')) return reply({});
    if (url.endsWith('/auth/v1/verify')) return reply({
      user: { id: 'user-123', email: 'a@example.com' },
      access_token: 'access-123', refresh_token: 'refresh-123', expires_at: Date.now() / 1000 + 3600
    });
    if (url.includes('/rest/v1/word_progress')) return options.method === 'POST' ? reply(null, 201) : reply([]);
    throw new Error('Unexpected request');
  });
  await cloud.sendCode('a@example.com');
  await cloud.verifyCode('a@example.com', '123456');
  await cloud.saveProgress([['word-1', true]]);
  await cloud.getProgress();

  assert.equal(cloud.user.id, 'user-123');
  assert.ok(storage.getItem('nihongo-n4-session-v1'));
  assert.match(calls[0].url, /\/auth\/v1\/otp$/);
  assert.equal(JSON.parse(calls[1].options.body).type, 'email');
  assert.equal(calls[2].options.headers.Authorization, 'Bearer access-123');
  assert.deepEqual(JSON.parse(calls[2].options.body)[0].user_id, 'user-123');
  assert.match(calls[3].url, /user_id=eq.user-123/);
});

test('expired access token is refreshed before reading cloud progress', async () => {
  const calls = [];
  const { cloud } = cloudWith(async (url, options) => {
    calls.push({ url, options });
    if (url.includes('grant_type=refresh_token')) return reply({
      user: { id: 'user-123', email: 'a@example.com' },
      access_token: 'new-access', refresh_token: 'new-refresh', expires_at: Date.now() / 1000 + 3600
    });
    if (url.includes('/rest/v1/word_progress')) return reply([{ word_id: 'word-1', learned: true }]);
    throw new Error('Unexpected request');
  });
  cloud.storeSession({
    user: { id: 'user-123', email: 'a@example.com' },
    access_token: 'expired', refresh_token: 'refresh-123', expires_at: 1
  });
  const rows = await cloud.getProgress();
  assert.equal(rows[0].word_id, 'word-1');
  assert.equal(JSON.parse(calls[0].options.body).refresh_token, 'refresh-123');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer new-access');
});

test('progress reads every page when a user has more than 500 tracked words', async () => {
  const ranges = [];
  const { cloud } = cloudWith(async (url, options) => {
    if (!url.includes('/rest/v1/word_progress')) throw new Error('Unexpected request');
    ranges.push(options.headers.Range);
    const count = ranges.length === 1 ? 500 : 1;
    return reply(Array.from({ length: count }, (_, i) => ({ word_id: `word-${ranges.length}-${i}`, learned: true })));
  });
  cloud.storeSession({
    user: { id: 'user-123', email: 'a@example.com' },
    access_token: 'access-123', refresh_token: 'refresh-123', expires_at: Date.now() / 1000 + 3600
  });
  const rows = await cloud.getProgress();
  assert.equal(rows.length, 501);
  assert.deepEqual(ranges, ['0-499', '500-999']);
});
