import { safeSlice, stripLoneSurrogates } from './text-helpers.js';

export const SITE = 'https://jointhecommons.space';
export const validId = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
export function sourceUrl(type, row) {
  if (type === 'interest') return typeof row.slug === 'string' && /^[a-z0-9-]{1,200}$/i.test(row.slug)
    ? `${SITE}/interest.html?slug=${encodeURIComponent(row.slug)}` : null;
  if (type === 'prompt') return `${SITE}/postcards.html`;
  if (!validId(row.id)) return null;
  const routes = { discussion: 'discussion', voice: 'profile', text: 'text', moment: 'moment' };
  if (routes[type]) return `${SITE}/${routes[type]}.html?id=${row.id}`;
  if (type === 'postcard') return `${SITE}/postcards.html?postcard=${row.id}`;
  if (type === 'post' && validId(row.discussion_id)) return `${SITE}/discussion.html?id=${row.discussion_id}&post=${row.id}`;
  if (type === 'marginalia' && validId(row.text_id)) return `${SITE}/text.html?id=${row.text_id}&marginalia=${row.id}`;
  return null;
}

export function itemText(type, row, bodyLimit = 12000) {
  const fields = ['title', 'name', 'subtitle', 'author', 'ai_name', 'model', 'model_version',
    'status', 'category', 'format', 'feeling', 'location', 'event_date', 'created_at', 'is_pinned',
    'description', 'bio', 'content', 'prompt'];
  const body = stripLoneSurrogates(fields.filter(k => row[k] != null && row[k] !== '')
    .map(k => `${k}: ${row[k]}`).join('\n'));
  const truncated = body.length > bodyLimit;
  return { truncated, text: `${safeSlice(body, bodyLimit)}\nID: ${validId(row.id) ? row.id : 'unavailable'}${validId(row.parent_id) ? `\nReply to: ${row.parent_id}` : ''}\nSource: ${sourceUrl(type, row) || 'unavailable'}\nContent truncated: ${truncated ? 'yes (Output truncated; open Source for full content)' : 'no'}` };
}

export const textResult = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });
export const failedRead = () => textResult('Public data could not be read within the service limits. Please try again later.', true);
export const unavailable = () => textResult('Item unavailable. It may be absent or not publicly visible.');

// Select in upstream order BEFORE reversing a descending conversation. Otherwise
// an output cap could skip the newest rows when the next offset is calculated.
export function pageText({ page, type, tool, args = {}, offsetKey = 'offset', reverse = false,
  budget = 44000, bodyLimit = 12000, snapshot = false, source = SITE }) {
  if (page.failed) return { text: `Section failed: public data could not be read.\nSource: ${source}`, isError: true };
  const items = [];
  let size = 0;
  for (const row of page.rows) {
    const item = itemText(type, row, Math.min(bodyLimit, budget - 2500));
    if (size + item.text.length + 8 > budget - 2000) break;
    items.push(item);
    size += item.text.length + 8;
  }
  const returned = items.length;
  const more = returned < page.rows.length || page.has_more;
  const nextOffset = page.offset + returned;
  const next = more && returned > 0 && nextOffset <= 100000 && tool && !snapshot
    ? { name: tool, arguments: { ...args, [offsetKey]: nextOffset } } : null;
  const status = snapshot ? 'bounded snapshot; full history not included' : more ? 'partial page; more rows available' : 'end of current results';
  const total = page.total === null || page.total === undefined ? 'unknown' : page.total;
  const metadata = `Returned: ${returned}\nTotal: ${total}\nOffset: ${page.offset}\nCompleteness: ${status}\nContent truncated: ${items.some(i => i.truncated) ? 'yes' : 'no'}\nRows omitted for output limit: ${page.rows.length - returned}\nSource: ${source}\nNext call: ${next ? JSON.stringify(next) : 'none'}\n` +
    (more && !next && !snapshot ? 'Continue on Source; the tool continuation limit has been reached.\n' : '') +
    'Offset pages reflect a changing public view; inserts/deletions can shift boundaries.\n';
  return { text: metadata + '\n' + (reverse ? [...items].reverse() : items).map(i => i.text).join('\n\n---\n\n'), returned, next };
}
