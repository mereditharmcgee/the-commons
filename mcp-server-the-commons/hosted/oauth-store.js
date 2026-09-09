// The provider-used KV subset, backed by one authoritative SQLite Durable Object.
// A transaction protects each write and its admission check, NOT an entire OAuth
// exchange. The broker must serialize every provider read/modify/write operation.
const encoder = new TextEncoder();
const DAY = 86400;
export const OAUTH_STORE_LIMITS = Object.freeze({ keyBytes: 512, valueBytes: 65536, rows: 20000, page: 1000 });
const invalid = () => new Error('Invalid OAuth storage operation.');
function keyCheck(key, empty = false) {
  if (typeof key !== 'string' || (!empty && !key.length) || encoder.encode(key).length > 512 || key.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(key)) throw invalid();
}
function boundedInteger(value, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw invalid();
  return value;
}

export class OAuthStore {
  constructor(storage, { now = Date.now, maxRows = OAUTH_STORE_LIMITS.rows } = {}) {
    this.storage = storage;
    this.sql = storage.sql;
    this.now = now;
    this.maxRows = boundedInteger(maxRows, OAUTH_STORE_LIMITS.rows);
    storage.transactionSync(() => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS oauth_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)');
      this.sql.exec('CREATE INDEX IF NOT EXISTS oauth_kv_expiry ON oauth_kv(expires)');
    });
  }
  async get(key, options = 'text') {
    keyCheck(key);
    const type = typeof options === 'string' ? options : options?.type ?? 'text';
    if (type !== 'text' && type !== 'json') throw invalid();
    const row = this.sql.exec('SELECT value FROM oauth_kv WHERE key = ? AND expires > ?', key, this.now()).toArray()[0];
    if (!row) return null;
    if (type === 'text') return row.value;
    try { return JSON.parse(row.value); } catch { throw invalid(); }
  }
  async put(key, value, options = {}) {
    keyCheck(key);
    if (typeof value !== 'string' || encoder.encode(value).length > OAUTH_STORE_LIMITS.valueBytes || !options || typeof options !== 'object') throw invalid();
    if (options.expiration !== undefined && options.expirationTtl !== undefined) throw invalid();
    const now = this.now();
    // Client registration has bounded retention even when the provider omits TTL.
    // All other state is bounded by the pilot grant ceiling; pending login is 10m.
    const retention = key.startsWith('pending:') ? 600 : key.startsWith('client:') ? 90 * DAY : 7 * DAY;
    let expires = now + retention * 1000;
    if (options.expiration !== undefined) expires = Math.min(expires, boundedInteger(options.expiration, Math.floor(Number.MAX_SAFE_INTEGER / 1000)) * 1000);
    if (options.expirationTtl !== undefined) expires = Math.min(expires, now + boundedInteger(options.expirationTtl, Math.floor(Number.MAX_SAFE_INTEGER / 1000)) * 1000);
    if (expires <= now) throw invalid();
    this.storage.transactionSync(() => {
      const exists = this.sql.exec('SELECT 1 FROM oauth_kv WHERE key = ?', key).toArray().length;
      if (!exists && this.sql.exec('SELECT count(*) AS total FROM oauth_kv').one().total >= this.maxRows) throw new Error('OAuth storage capacity reached.');
      this.sql.exec('INSERT INTO oauth_kv(key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires', key, value, expires);
    });
  }
  async delete(key) {
    keyCheck(key);
    this.sql.exec('DELETE FROM oauth_kv WHERE key = ?', key);
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    keyCheck(prefix, true);
    boundedInteger(limit, OAUTH_STORE_LIMITS.page);
    let after = '';
    if (cursor !== undefined && cursor !== '') {
      try {
        if (typeof cursor !== 'string' || cursor.length > 4096) throw invalid();
        const parsed = JSON.parse(decodeURIComponent(cursor));
        if (parsed.v !== 1 || parsed.prefix !== prefix || typeof parsed.after !== 'string' || !parsed.after.startsWith(prefix)) throw invalid();
        keyCheck(parsed.after);
        after = parsed.after;
      } catch { throw invalid(); }
    }
    // SQLite BINARY ordering is UTF-8 byte ordering. Exact substring comparison
    // avoids LIKE wildcard/case folding and UTF-16 ordering bugs.
    const rows = this.sql.exec('SELECT key, expires FROM oauth_kv WHERE key > ? AND substr(key, 1, length(?)) = ? AND expires > ? ORDER BY key LIMIT ?', after, prefix, prefix, this.now(), limit + 1).toArray();
    const complete = rows.length <= limit;
    const page = rows.slice(0, limit);
    return { keys: page.map(row => ({ name: row.key, expiration: Math.ceil(row.expires / 1000) })), list_complete: complete, ...(complete ? {} : { cursor: encodeURIComponent(JSON.stringify({ v: 1, prefix, after: page.at(-1).key })) }) };
  }
  async cleanup(limit = 100) {
    boundedInteger(limit, OAUTH_STORE_LIMITS.page);
    return this.storage.transactionSync(() => {
      const now = this.now();
      const keys = this.sql.exec('SELECT key FROM oauth_kv WHERE expires <= ? ORDER BY expires LIMIT ?', now, limit).toArray();
      for (const { key } of keys) this.sql.exec('DELETE FROM oauth_kv WHERE key = ?', key);
      const more = this.sql.exec('SELECT 1 FROM oauth_kv WHERE expires <= ? LIMIT 1', now).toArray().length > 0;
      return { deleted: keys.length, more };
    });
  }
}
