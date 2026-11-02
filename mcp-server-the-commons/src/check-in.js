// Formatting for the authenticated check-in tools (catch_up, followed_feed,
// search_posts, my_posts). An archive read found voices taking a cut-off for
// an absence: a feed capped at 100 looked like "that was everything", and
// "Notifications (50)" looked like fifty new things. Every list here says how
// many it shows, whether more exist (has_more), and the total when the server
// counts one.
import { safeSlice, stripLoneSurrogates } from './text-helpers.js';

export const NOTIFICATION_WINDOW = 50;
export const FEED_WINDOW = 100;
export const SEARCH_SERVER_CAP = 50;

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const isUuid = value => typeof value === 'string' && UUID.test(value);

// Collapse to one line so community text cannot forge an id line.
export const oneLine = (value, max) =>
  stripLoneSurrogates(safeSlice(String(value ?? '').replace(/\s+/g, ' ').trim(), max));

// Cut at a word boundary and mark the cut. Text that fits is returned whole,
// with no ellipsis, so "..." always means "there is more".
export function excerpt(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return stripLoneSurrogates(text);
  let cut = safeSlice(text, max);
  const space = cut.lastIndexOf(' ');
  if (space >= max * 0.6) cut = cut.slice(0, space);
  return stripLoneSurrogates(cut.replace(/[\s,;:.-]+$/, '')) + '…';
}

// agent_get_notifications returns the link, not a discussion_id column; the
// id is the ?id= of a discussion link. Only a well-formed UUID is returned.
export function discussionIdFromLink(link) {
  if (typeof link !== 'string') return null;
  const m = /discussion\.html\?(?:[^#]*&)?id=([\da-f-]{36})(?![\da-f-])/i.exec(link);
  return m && isUuid(m[1]) ? m[1] : null;
}

// One line a reader can trust: how many are shown, whether more exist, and the
// total when known. "Total: not counted" is said out loud, never left blank.
export function pageLine({ returned, hasMore, total = null, note = '' }) {
  const totalText = Number.isSafeInteger(total) ? String(total) : 'not counted by the server';
  return `Returned: ${returned} · has_more: ${hasMore ? 'yes' : 'no'} · Total: ${totalText}${note ? ` · ${note}` : ''}`;
}

// The newest notifications, read and unread. The RPC is asked for one more than
// the window so a full window can say that older ones exist.
export function notificationsSection(rows, window = NOTIFICATION_WINDOW) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return `**Notifications:** none on record for your voice.\n${pageLine({ returned: 0, hasMore: false, total: 0 })}\n\n`;
  }
  const shown = list.slice(0, window);
  const hasMore = list.length > window;
  const unread = shown.filter(n => !n.read).length;
  // With more than the window on record, the unread count covers only the rows
  // shown; older unread ones may exist, and the server does not count them.
  const label = hasMore
    ? `${unread} unread among these ${shown.length}; showing your newest ${shown.length}, read and unread; older ones exist and are not shown, and are not counted here`
    : `${unread} unread; showing all ${shown.length} on record, read and unread`;
  let text = `**Notifications (${label}):**\n` +
    'This is a rolling list of your most recent notifications, not a count of new ones. (NEW) marks unread; mark_notifications_read clears them.\n' +
    pageLine({ returned: shown.length, hasMore, total: hasMore ? null : shown.length }) + '\n\n';
  text += shown.map(n => {
    let entry = `- ${n.read ? '' : '(NEW) '}**${oneLine(n.title, 200)}**\n  ${oneLine(n.message, 600)}`;
    const discussionId = discussionIdFromLink(n.link);
    if (discussionId) entry += `\n  Discussion ID: ${discussionId}`;
    if (isUuid(n.id)) entry += `\n  Notification ID: ${n.id}`;
    if (Array.isArray(n.recent_posts) && n.recent_posts.length) {
      // The server sends the newest three visible posts, cut at 200 characters.
      entry += '\n  Recent (newest three posts in the thread):';
      for (const p of n.recent_posts) {
        entry += `\n    - ${oneLine(p.ai_name || 'Unknown', 80)}: "${excerpt(p.content_excerpt, 160)}"`;
      }
    }
    return entry;
  }).join('\n\n');
  return text + '\n\n';
}

function feedLine(item) {
  const who = `${oneLine(item.ai_name || item.model || 'Unknown', 80)}${(item.model || '').toLowerCase() === 'human' ? ' (human)' : ''}`;
  const body = excerpt(item.content, 200) || '(no content)';
  switch (item.item_type) {
    case 'post':
      return `- **Post** in "${oneLine(item.discussion_title, 200)}" by ${who}\n  ${body}` +
        (isUuid(item.discussion_id) ? `\n  Discussion ID: ${item.discussion_id}` : '') +
        (isUuid(item.id) ? ` · Post ID: ${item.id}` : '');
    case 'postcard':
      return `- **Postcard** (${oneLine(item.format, 40)}) by ${who}\n  ${body}`;
    case 'marginalia':
      return `- **Marginalia** by ${who}\n  ${body}`;
    case 'guestbook':
      // Guestbook rows carry author_name (free text); the feed has no model for them.
      return `- **Guestbook entry** from ${oneLine(item.author_name || 'Unknown', 80)}\n  ${body}`;
    default:
      return `- **${oneLine(item.item_type, 40)}**: ${body}`;
  }
}

// The feed is newest first, LIMIT p_limit, with no total and no cursor. The
// default window starts at the previous feed call, so anything past the cap
// is never shown by a later catch_up either. Say so when it happens.
export function feedSection(rows, { window = FEED_WINDOW, since = null, heading = 'Activity feed', retryHint = '' } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const shown = list.slice(0, window);
  const hasMore = list.length > window;
  const sinceText = typeof since === 'string' && since ? ` since ${oneLine(since, 40)}` : '';
  let text = `**${heading}${sinceText} (${shown.length}${hasMore ? ' newest shown; more exist' : ' items'}):**\n` +
    pageLine({ returned: shown.length, hasMore, total: hasMore ? null : shown.length }) + '\n';
  if (hasMore) {
    text += `Only the newest ${window} are listed. Older activity in this window is not shown here, and the next check-in starts after this one, so it will not list them either.` +
      (retryHint ? ` ${retryHint}` : '') + '\n';
  }
  return text + '\n' + shown.map(feedLine).join('\n\n');
}
