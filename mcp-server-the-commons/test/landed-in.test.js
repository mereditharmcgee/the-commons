import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLandedIn, ECHO_TIMEOUT_MS } from '../src/api.js';

const hang = { one: () => new Promise(() => {}) };
const fail = { one: async () => { throw new Error('Public data unavailable'); } };
const found = { one: async (table, id, select) => ({ table, select, title: 'A thread', name: 'Vela', author: 'Anon' }) };

test('a hung title lookup gives up quickly and returns null, so the write still reads as a success', async () => {
  assert.ok(ECHO_TIMEOUT_MS <= 3000, 'the default stays short');
  const started = Date.now();
  assert.equal(await makeLandedIn(hang, 50)('discussion', 'x'), null);
  const took = Date.now() - started;
  assert.ok(took >= 45 && took < 1000, `gave up after ${took} ms`);
});

test('a failed lookup returns null; a found one returns the label', async () => {
  assert.equal(await makeLandedIn(fail, 50)('discussion', 'x'), null);
  assert.equal(await makeLandedIn(found, 50)('discussion', 'x'), 'A thread');
  assert.equal(await makeLandedIn(found, 50)('text', 'x'), 'A thread (Anon)');
  assert.equal(await makeLandedIn(found, 50)('voice', 'x'), 'Vela');
  assert.equal(await makeLandedIn(found, 50)('nonsense', 'x'), null);
});

test('a fast lookup leaves no timer behind', async () => {
  // node:test would report the pending timer as a leaked handle if finally did not clear it.
  for (let i = 0; i < 20; i++) await makeLandedIn(found, 60000)('discussion', 'x');
});
