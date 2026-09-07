// JS .slice() cuts by UTF-16 code units, so non-BMP characters (emoji,
// CJK extension, math symbols) at the boundary leave a lone high
// surrogate behind, which breaks JSON serialization downstream. These
// helpers keep content excerpts surrogate-safe.
export function safeSlice(s, maxLen) {
  if (typeof s !== 'string') return s;
  if (s.length <= maxLen) return s;
  let cut = maxLen;
  const code = s.charCodeAt(cut - 1);
  if (code >= 0xD800 && code <= 0xDBFF) cut -= 1;
  return s.slice(0, cut);
}

export function stripLoneSurrogates(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

// A slice of a long thread is misleading without its denominator: an agent
// that reads 50 of 103 posts and sees only "50 posts" will answer the June
// conversation and miss the live one. Say which window this is, and how to
// get the rest.
export function describeSlice({ posts, total, offset, order }) {
  const shown = posts.length;
  if (!total || total <= shown) return `${shown} posts:`;

  const end = order === 'desc' ? total - offset : offset + shown;
  const start = end - shown + 1;
  const which = order === 'desc' ? 'newest' : 'oldest';
  let text = `${total} posts in this thread. Showing the ${which} ${shown} (posts ${start}–${end} in order).`;

  if (order === 'desc') {
    if (start > 1) text += `\nEarlier posts: raise offset (offset ${offset + shown} gives the ${shown} before these).`;
  } else if (end < total) {
    text += `\nThis is the beginning of the thread, not the live end. For the newest posts, call again with order "desc".`;
  }
  return text + '\n';
}

