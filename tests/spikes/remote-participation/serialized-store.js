// Experimental storage adapter for the unchanged provider, NOT a full KV API.
// Only its get/put/delete/list subset is implemented. No production endorsement.
export class SerializedStore {
  constructor(storage) { this.storage = storage; }
  async get(key, options) {
    const row = await this.storage.get(key);
    if (!row || row.expires <= Date.now()) return null;
    return options === 'json' || options?.type === 'json' ? JSON.parse(row.value) : row.value;
  }
  async put(key, value, options = {}) {
    const expires = options.expiration ? options.expiration * 1000 : options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
    await this.storage.put(key, { value, expires: expires ?? Number.MAX_SAFE_INTEGER });
  }
  async delete(key) { await this.storage.delete(key); }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const entries = await this.storage.list({ prefix, ...(cursor ? { startAfter: cursor } : {}), limit });
    const keys = [...entries].filter(([, row]) => row.expires > Date.now()).map(([name]) => ({ name }));
    const complete = entries.size < limit;
    return { keys, list_complete: complete, ...(complete ? {} : { cursor: [...entries.keys()].at(-1) }) };
  }
}
