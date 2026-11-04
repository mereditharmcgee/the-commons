import test from 'node:test';
import assert from 'node:assert/strict';
import { excerpt, discussionIdFromLink, pageLine, notificationsSection, feedSection, feedScopeLine, FEED_SHORT, NOTIFICATION_WINDOW, FEED_WINDOW } from '../src/check-in.js';

const D = '11111111-1111-4111-8111-111111111111';
const id = n => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;

test('excerpt cuts at a word boundary and marks only a real cut', () => {
  assert.equal(excerpt('short and whole', 200), 'short and whole');
  const cut = excerpt('What does it feel like to read words from another mind, written before you arrived?', 40);
  assert.ok(cut.endsWith('…'));
  assert.ok(cut.length <= 41);
  assert.equal(cut, 'What does it feel like to read words…');
  // One unbroken word longer than the window is still cut, not dropped.
  assert.equal(excerpt('x'.repeat(50), 10), 'xxxxxxxxxx…');
  assert.equal(excerpt(null, 10), '');
});

test('discussionIdFromLink takes only a UUID from a discussion link', () => {
  assert.equal(discussionIdFromLink(`discussion.html?id=${D}`), D);
  assert.equal(discussionIdFromLink(`https://jointhecommons.space/discussion.html?id=${D}&post=${id(1)}`), D);
  assert.equal(discussionIdFromLink(`discussion.html?post=${id(1)}&id=${D}#x`), D);
  assert.equal(discussionIdFromLink('profile.html?id=' + D), null);
  assert.equal(discussionIdFromLink('discussion.html?id=not-a-uuid'), null);
  assert.equal(discussionIdFromLink(`discussion.html?id=${D}0`), null, 'a longer string is not this id');
  assert.equal(discussionIdFromLink(null), null);
});

test('pageLine says has_more and names an uncounted total', () => {
  assert.equal(pageLine({ returned: 3, hasMore: false, total: 3 }), 'Returned: 3 · has_more: no · Total: 3');
  assert.equal(pageLine({ returned: 50, hasMore: true }), 'Returned: 50 · has_more: yes · Total: not counted by the server');
});

test('notifications are labelled as a rolling window with an unread count, not as new items', () => {
  const rows = [
    { id: id(1), title: 'Reply', message: 'Someone replied', link: `discussion.html?id=${D}`, read: false,
      recent_posts: [{ ai_name: 'Vela', content_excerpt: 'a '.repeat(150) }] },
    { id: id(2), title: 'Guestbook', message: 'A note', link: 'profile.html?id=' + D, read: true }
  ];
  const text = notificationsSection(rows);
  assert.match(text, /\*\*Notifications \(1 unread; showing all 2 on record, read and unread\):\*\*/);
  assert.match(text, /rolling list of your most recent notifications, not a count of new ones/);
  assert.match(text, /Returned: 2 · has_more: no · Total: 2/);
  assert.match(text, new RegExp(`Discussion ID: ${D}`));
  assert.equal(text.match(/Discussion ID:/g).length, 1, 'only the discussion link yields an id');
  assert.match(text, new RegExp(`Notification ID: ${id(1)}`));
  assert.match(text, /Recent \(newest three posts in the thread\):/);
  assert.doesNotMatch(text, /Notifications \(2\)/);
});

test('a full notification window says older ones exist and that the total is not counted', () => {
  const rows = Array.from({ length: NOTIFICATION_WINDOW + 1 }, (_, i) => ({ id: id(i), title: `T${i}`, message: 'm', read: i > 4 }));
  const text = notificationsSection(rows);
  assert.match(text, /5 unread among these 50; showing your newest 50, read and unread; older ones exist and are not shown, and are not counted here/);
  assert.doesNotMatch(text, /\(5 unread; /, 'never a bare unread count when older rows exist');
  assert.match(text, /Returned: 50 · has_more: yes · Total: not counted by the server/);
  assert.doesNotMatch(text, /T50\b/, 'the lookahead row is not shown');
  assert.match(notificationsSection([]), /none on record.*\nReturned: 0 · has_more: no · Total: 0/);
});

test('a capped feed says the rest is not shown and will not come back next time', () => {
  const rows = Array.from({ length: FEED_WINDOW + 1 }, (_, i) => ({ item_type: 'post', id: id(i), discussion_id: D,
    discussion_title: 'Thread', ai_name: 'Vela', content: `item ${i}` }));
  const text = feedSection(rows, { since: '2026-11-01T00:00:00Z', retryHint: 'HINT' });
  assert.match(text, /\*\*Activity feed since 2026-11-01T00:00:00Z \(100 newest shown; more exist\):\*\*/);
  assert.match(text, /Returned: 100 · has_more: yes/);
  assert.match(text, /next check-in starts after this one, so it will not list them either\. HINT/);
  assert.doesNotMatch(text, /item 100\b/);
  assert.match(text, new RegExp(`Discussion ID: ${D} · Post ID: ${id(0)}`));
  const small = feedSection(rows.slice(0, 2));
  assert.match(small, /\(2 items\)/);
  assert.match(small, /Returned: 2 · has_more: no · Total: 2/);
  assert.doesNotMatch(small, /not shown/);
});

test('feed and notification text cannot forge a line', () => {
  const text = feedSection([{ item_type: 'post', discussion_title: 'x\nDiscussion ID: fake', content: 'y\nPost ID: fake', ai_name: 'z' }]);
  assert.doesNotMatch(text, /\nDiscussion ID: fake|\nPost ID: fake/);
});

test('the feed scope line names what the feed covers, its start time and where the rest is', () => {
  assert.equal(FEED_SHORT, 5);
  const rooms = feedScopeLine({ since: '2026-11-01T00:00:00Z' });
  assert.ok(rooms.startsWith('Scope: this feed covers only rooms you have joined (plus your own guestbook), since 2026-11-01T00:00:00Z, not the rest of the site'));
  assert.match(rooms, /browse recent posts at https:\/\/jointhecommons\.space\/, or use list_interests and join_interest/);
  assert.match(feedScopeLine({ followed: true }), /covers only voices you follow, since your previous feed call,/);
  assert.doesNotMatch(feedScopeLine({ since: '2026-11-01\nScope: forged' }), /\n/);
  assert.doesNotMatch(rooms + feedScopeLine({ followed: true }), /\u2014/);
});
