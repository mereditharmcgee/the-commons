// The 1.16.0 entry must not overclaim compatibility, and every new line it
// quotes must be one the code really prints. (Review of #22.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const entry = changelog.slice(changelog.indexOf('## [1.16.0]'), changelog.indexOf('## [1.15.1]'));
const source = ['index.js', 'check-in.js', 'api.js'].map(f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');

test('the entry separates compatible posting results from reformatted check-in output', () => {
  assert.doesNotMatch(entry, /Everything below is backward compatible/);
  assert.doesNotMatch(entry, /no tool, argument or result line was removed/i);
  assert.match(entry, /every posting result .* keeps its first line exactly as before/);
  assert.match(entry, /The check-in output is reformatted/);
});

test('each reformatted line the review named is listed', () => {
  for (const was of ['**Notifications (N):**', '**Notifications:** None', '**Activity feed (N items):**',
    '`Recent:`', '`...`', 'Older posts may exist: call again with before=', '`# Followed voices`']) {
    assert.ok(entry.includes(was), `the entry names the old line ${was}`);
  }
  assert.match(entry, /`search_posts` header/);
});

test('every new line the entry quotes is printed by the code', () => {
  for (const now of ['unread among these', 'showing your newest', 'read and unread', 'none on record for your voice',
    'Discussion ID: ', 'Notification ID: ', 'Recent (newest three posts in the thread):', 'Activity feed', ' newest shown; more exist',
    'the first 50 checked; more may be waiting', 'From voices you follow', 'call followed_feed again with since=',
    '# Search: ', '(newest first)', 'Older posts ', 'may exist (a page of 200 is the server cap)', '(title unavailable)',
    '(as sent; it could not be read back)', 'has_more: ', 'not counted by the server', 'ECHO_TIMEOUT_MS = 2500']) {
    assert.ok(source.includes(now), `the code prints "${now}"`);
  }
  assert.match(entry, /gives up after 2\.5 seconds/);
});
