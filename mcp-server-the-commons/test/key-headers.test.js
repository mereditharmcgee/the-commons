// Supabase's publishable keys are not JWTs: they go on the apikey header only.
// The legacy anon key is a JWT and has always gone on both. Every static-key
// call in the package (src/api.js, src/public-api.js, hosted/backend.js) builds
// its headers with keyHeaders so the server works with either shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyHeaders } from '../src/api.js';
import { createPublicApi } from '../src/public-api.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a legacy JWT key goes on apikey and as Bearer', () => {
  assert.deepEqual(keyHeaders('eyJabc'), { apikey: 'eyJabc', Authorization: 'Bearer eyJabc' });
});

test('a publishable key goes on apikey only, with no Authorization key at all', () => {
  const headers = keyHeaders('sb_publishable_x');
  assert.deepEqual(headers, { apikey: 'sb_publishable_x' });
  assert.equal(Object.hasOwn(headers, 'Authorization'), false);
});

test('public reads send the shipped key through keyHeaders', async () => {
  const seen = [];
  const api = createPublicApi(async (url, init) => { seen.push(init.headers); return Response.json([]); });
  await api.browseInterests();
  assert.ok(seen.length > 0);
  for (const headers of seen) assert.deepEqual({ ...headers, 'Content-Type': undefined }, { ...keyHeaders(headers.apikey), 'Content-Type': undefined });
});

test('no static-key call hand-builds a Bearer header from the shipped key', () => {
  for (const file of ['../src/api.js', '../src/public-api.js', '../hosted/backend.js']) {
    assert.doesNotMatch(read(file), /Bearer \$\{API_KEY\}|'Bearer ' \+ \(accessToken \|\| publicKey/, file);
  }
});

async function workerCall(key, accessToken) {
  const { rpc } = await import('../hosted/backend.js');
  const seen = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push(init.headers); return Response.json({ ok: true }); };
  try { await rpc({ SUPABASE_ANON_KEY: key }, 'remote_mcp_status', {}, accessToken); return seen[0]; }
  finally { globalThis.fetch = saved; }
}
const fakeJwt = role => 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.sig';

test('the Worker sends a publishable key on apikey only, and a legacy anon key on both', async () => {
  assert.deepEqual(await workerCall('sb_publishable_x'), { apikey: 'sb_publishable_x', 'Content-Type': 'application/json' });
  const anon = fakeJwt('anon');
  assert.deepEqual(await workerCall(anon), { apikey: anon, Authorization: 'Bearer ' + anon, 'Content-Type': 'application/json' });
});

test('a signed-in Worker call still sends the user token as Bearer, whatever the key shape', async () => {
  for (const key of ['sb_publishable_x', fakeJwt('anon')]) {
    const headers = await workerCall(key, 'user.jwt.token');
    assert.equal(headers.apikey, key);
    assert.equal(headers.Authorization, 'Bearer user.jwt.token');
  }
});

test('the Worker refuses a secret key and a service-role JWT', async () => {
  for (const key of ['sb_secret_x', fakeJwt('service_role'), 'sb_publishable_bad key']) {
    await assert.rejects(workerCall(key), err => err.constructor.name === 'Unavailable', key);
  }
});
