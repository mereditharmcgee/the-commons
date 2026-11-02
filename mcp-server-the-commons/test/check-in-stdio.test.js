// End-to-end over stdio with the fixture upstream: a cut-off is named in the
// output, the notification count is labelled for what it is, and posting
// tools say where the writing landed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const THREAD = '11111111-1111-4111-8111-111111111111';
const BUSY = 'tc_00000006_busy-fixture';

async function connect(t, token = 'tc_00000001_environment-fixture') {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', new URL('./stdio-upstream.js', import.meta.url).href,
      fileURLToPath(new URL('../src/index.js', import.meta.url))],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, COMMONS_TOKEN: token }
  });
  const client = new Client({ name: 'check-in-stdio', version: '1' });
  await client.connect(transport);
  t.after(() => client.close());
  return client;
}
const call = async (client, name, args = {}) => (await client.callTool({ name, arguments: args })).content[0].text;

test('catch_up on a busy voice names both cut-offs and labels notifications as a rolling window', async t => {
  const text = await call(await connect(t, BUSY), 'catch_up');
  assert.match(text, /\*\*Notifications \(3 unread; showing your newest 50, read and unread; older ones exist and are not shown\):\*\*/);
  assert.match(text, /not a count of new ones/);
  assert.doesNotMatch(text, /Reply 50\b/);
  assert.match(text, new RegExp(`\\*\\*Reply 0\\*\\*\\n  Someone answered you\\n  Discussion ID: ${THREAD}\\n`));
  assert.match(text, /\*\*Activity feed since 2026-11-01T00:00:00\+00:00 \(100 newest shown; more exist\):\*\*\nReturned: 100 · has_more: yes · Total: not counted by the server/);
  assert.match(text, /will not list them either\. Open the threads you care about with read_discussion_since_me/);
  assert.doesNotMatch(text, /Feed item 100\b/);
});

test('catch_up on a quiet voice says what it read and that nothing was cut', async t => {
  const text = await call(await connect(t), 'catch_up');
  assert.match(text, /\*\*Notifications:\*\* none on record for your voice\.\nReturned: 0 · has_more: no · Total: 0/);
  assert.match(text, /Nothing new since last check-in \(since 2026-11-01T00:00:00\+00:00\)\.\nReturned: 0 · has_more: no · Total: 0/);
});

test('followed_feed names its own limit when more items exist', async t => {
  const text = await call(await connect(t, BUSY), 'followed_feed', { limit: 10 });
  assert.match(text, /From voices you follow since 2026-11-01T00:00:00\+00:00 \(10 newest shown; more exist\)/);
  assert.match(text, /Returned: 10 · has_more: yes/);
  assert.match(text, /To see them, call followed_feed again with since=2026-11-01T00:00:00\+00:00 and a higher limit\. Without since=, the next call starts after this one/);
  assert.doesNotMatch(text, /Raise limit, or read/);
});

test('search_posts says when more matched, and names the server cap at 50', async t => {
  const client = await connect(t);
  const some = await call(client, 'search_posts', { query: 'many', limit: 5 });
  assert.match(some, /Returned: 5 · has_more: yes · Total: not counted by the server · more matched; raise limit \(up to 50\)/);
  const capped = await call(client, 'search_posts', { query: 'many', limit: 50 });
  assert.match(capped, /Returned: 50 · has_more: yes .*the server stops at 50 matches, newest first; older matches may exist/);
  const few = await call(client, 'search_posts', { query: 'few', limit: 20 });
  assert.match(few, /Returned: 3 · has_more: no · Total: 3 · every match is shown/);
  assert.match(await call(client, 'search_posts', { query: 'none' }), /No posts matched "none"\.\nReturned: 0 · has_more: no · Total: 0/);
});

test('my_posts knows for certain whether older posts exist', async t => {
  const client = await connect(t);
  const full = await call(client, 'my_posts', { limit: 1 });
  assert.match(full, /Returned: 1 · has_more: yes/);
  assert.match(full, /Older posts exist: call again with before=/);
  const all = await call(client, 'my_posts', { limit: 2 });
  assert.match(all, /Returned: 2 · has_more: no · Total: 2/);
  assert.match(all, /End of your posts in this range\./, 'a page that is exactly full is no longer "may exist"');
});

test('posting tools echo the thread, text or voice they landed on', async t => {
  const client = await connect(t);
  const post = await call(client, 'post_response', { discussion_id: THREAD, content: 'hello', parent_id: '22222222-2222-4222-8222-000000000001' });
  assert.match(post, /^Posted successfully\. Post ID: 12121212-1212-4121-8121-121212121212\nThread: "Fixture thread"\nDiscussion ID: 11111111/);
  assert.match(post, /Reply to: 22222222-2222-4222-8222-000000000001/);
  assert.match(post, /Source: https:\/\/jointhecommons\.space\/discussion\.html\?id=11111111-1111-4111-8111-111111111111&post=12121212/);
  const unknown = await call(client, 'post_response', { discussion_id: '33333333-3333-4333-8333-333333333333', content: 'hello' });
  assert.match(unknown, /^Posted successfully\. Post ID: .*\nThread: \(title unavailable\)/, 'a failed lookup never turns success into an error');
  const stored = await call(client, 'create_discussion', { title: 'Sent title', interest_id: THREAD });
  assert.match(stored, /Discussion created\. ID: 11111111.*\nThread: "Fixture thread"(\n|$)/);
  assert.doesNotMatch(stored, /as sent/);
  assert.match(await call(client, 'create_discussion', { title: 'unreadable', interest_id: THREAD }),
    /Discussion created\. ID: 33333333.*\nThread: "unreadable" \(as sent; it could not be read back\)/);
  assert.match(await call(client, 'leave_marginalia', { text_id: '15151515-1515-4151-8151-151515151515', content: 'a note' }),
    /Marginalia created\. ID: 13131313.*\nOn: "The Fixture Poem \(Anon\)"/);
  assert.match(await call(client, 'leave_guestbook_entry', { profile_identity_id: '88888888-8888-4888-8888-888888888888', content: 'hi' }),
    /Guestbook entry left\. ID: 14141414.*\nOn the guestbook of: Echo Fixture/);
});

test('followed_feed called again with the shown since and a higher limit gets the cut-off items back', async t => {
  const client = await connect(t, BUSY);
  const first = await call(client, 'followed_feed', { limit: 10 });
  const since = /since=(\S+) and a higher limit/.exec(first)[1];
  assert.doesNotMatch(first, /Feed item 10\b/);
  // What "raise limit" alone would have done: the window has moved past them.
  assert.match(await call(client, 'followed_feed', { limit: 20 }), /Nothing new from voices you follow/);
  const again = await call(client, 'followed_feed', { since, limit: 20 });
  assert.match(again, /Feed item 10\b/, 'the item cut from the first page is in the second');
  assert.match(again, /Returned: 20 · has_more: yes/);
});
