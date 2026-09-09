// Node-only fixture. This is NOT a substitute for workerd/KV consistency tests.
import { registerHooks } from 'node:module';
import net from 'node:net';
net.Socket.prototype.connect = () => { throw new Error('Offline spike: sockets blocked'); };
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export class WorkerEntrypoint {}', shortCircuit: true
  };
  return next(specifier, context);
} });
export const documents = new Map();
// Exercise CIMD negotiation; real SSRF flag enforcement still requires workerd.
globalThis.Cloudflare = { compatibilityFlags: { global_fetch_strictly_public: true } };
globalThis.fetch = async input => {
  const url = String(input instanceof Request ? input.url : input);
  if (!documents.has(url)) throw new Error('Offline spike: network blocked');
  return Response.json(documents.get(url));
};
export class MemoryKV {
  rows = new Map();
  async put(key, value, options = {}) {
    this.rows.set(key, { value, expiry: options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : Infinity });
  }
  async get(key, options) {
    const row = this.rows.get(key);
    if (!row || row.expiry <= Date.now()) return null;
    return options === 'json' || options?.type === 'json' ? JSON.parse(row.value) : row.value;
  }
  async delete(key) { this.rows.delete(key); }
  async list({ prefix = '' } = {}) {
    return { keys: [...this.rows.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true };
  }
}
