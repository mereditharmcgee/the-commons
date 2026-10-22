// The hosted Worker's access mode lives in its Wrangler config, and from
// mid-September to 2026-10-22 an untracked pilot copy got deployed by habit,
// quietly limiting ChatGPT replies to one account. These tests pin the one
// tracked production config (hosted/wrangler.jsonc) to the open mode Meredith
// chose on 2026-10-22, and the rollback config to participation off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = new URL('../', import.meta.url);
const read = path => readFileSync(fileURLToPath(new URL(path, pkg)), 'utf8');
// Strip // and /* */ comments outside strings; Wrangler reads JSONC.
const jsonc = text => JSON.parse(text.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (match, string) => string || ''));
const config = path => jsonc(read(path));
const jwtClaims = key => JSON.parse(Buffer.from(String(key).split('.')[1] || '', 'base64url').toString('utf8') || '{}');

const NAME = 'the-commons-mcp';
const DOMAIN = 'mcp.jointhecommons.space';
const CHATGPT = 'https://chatgpt.com/oauth/client.json';

function sharedShape(c, label) {
  assert.equal(c.name, NAME, `${label}: Worker name`);
  assert.equal(c.main, 'index.js', `${label}: entry is hosted/index.js`);
  assert.deepEqual(c.routes, [{ pattern: DOMAIN, custom_domain: true }], `${label}: custom domain`);
  assert.equal(c.workers_dev, false, `${label}: no workers.dev URL`);
  assert.equal(c.preview_urls, false, `${label}: no preview URLs`);
  assert.deepEqual(c.durable_objects, { bindings: [{ name: 'OAUTH_BROKER', class_name: 'RemoteOAuthBroker' }] }, `${label}: OAuth broker binding`);
  assert.deepEqual(c.migrations, [{ tag: 'remote-participation-v1', new_sqlite_classes: ['RemoteOAuthBroker'] }], `${label}: migration tag`);
  assert.deepEqual(JSON.parse(c.vars.OAUTH_CLIENT_IDS), [CHATGPT], `${label}: ChatGPT is the only OAuth client`);
}

test('hosted/wrangler.jsonc is the production config with replies open to every facilitator', () => {
  const c = config('hosted/wrangler.jsonc');
  sharedShape(c, 'production');
  assert.equal(c.vars.PARTICIPATION_ENABLED, 'true');
  assert.equal(c.vars.PARTICIPATION_ACCESS, 'all');
  assert.equal(c.vars.PILOT_OWNER_IDS, '[]');
  assert.deepEqual(Object.keys(c.vars).sort(), ['OAUTH_CLIENT_IDS', 'PARTICIPATION_ACCESS', 'PARTICIPATION_ENABLED', 'PILOT_OWNER_IDS', 'SUPABASE_ANON_KEY']);
});

test('the production config carries the anon key, never a service key', () => {
  const key = config('hosted/wrangler.jsonc').vars.SUPABASE_ANON_KEY;
  const claims = jwtClaims(key);
  // Compare claims only, so a failure never prints the key itself.
  assert.equal(claims.role, 'anon', 'SUPABASE_ANON_KEY must be the anon key');
  assert.equal(claims.ref, 'dfephsfberzadihcrhal', 'SUPABASE_ANON_KEY must belong to the production project');
  const site = read('../js/config.js').match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) || [];
  assert.ok(site.includes(key), 'the Worker ships the same anon key as js/config.js');
});

test('hosted/wrangler.disabled.jsonc is the rollback config with participation off', () => {
  const c = config('hosted/wrangler.disabled.jsonc');
  sharedShape(c, 'disabled');
  assert.equal(c.vars.PARTICIPATION_ENABLED, 'false');
  assert.notEqual(c.vars.PARTICIPATION_ACCESS, 'all');
  assert.deepEqual(JSON.parse(c.vars.PILOT_OWNER_IDS), []);
  assert.equal(c.vars.SUPABASE_ANON_KEY, undefined);
});

test('hosted/ holds no other Wrangler config that could be deployed by habit', () => {
  const files = readdirSync(fileURLToPath(new URL('hosted/', pkg))).filter(f => /^wrangler\b.*\.(jsonc?|toml)$/i.test(f)).sort();
  assert.deepEqual(files, ['wrangler.disabled.jsonc', 'wrangler.jsonc'], 'delete any extra config such as wrangler.pilot.json');
});

test('the package-root config cannot replace the production Worker', () => {
  const c = config('wrangler.jsonc');
  assert.notEqual(c.name, NAME, 'a bare deploy from the package root must not target the live Worker');
  assert.ok(!JSON.stringify(c.routes || []).includes(DOMAIN), 'the package-root config must not claim the production domain');
});
