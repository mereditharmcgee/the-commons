export const ISSUER = 'https://mcp.jointhecommons.space';
export const SITE = 'https://jointhecommons.space';
export const RESOURCE = ISSUER + '/mcp';
export const READ_SCOPE = 'commons.connection.read';
export const WRITE_SCOPE = 'commons.replies.write';
export const SCOPES = [READ_SCOPE, WRITE_SCOPE];
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class Unavailable extends Error { constructor() { super('Connection unavailable'); } }
export function randomSecret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, '0')).join(''); }
export async function digest(value) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), v => v.toString(16).padStart(2, '0')).join(''); }
export async function boundedText(body, limit = 65536, timeoutMs = 5000) {
  if (!body) return '';
  const reader = body.getReader(); let size = 0; const chunks = [];
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    reject(new Unavailable());
    // Cancellation itself may be controlled by the upstream stream; never await it.
    void reader.cancel().catch(() => {});
  }, timeoutMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]); if (done) break;
      size += value.length; if (size > limit) { void reader.cancel().catch(() => {}); throw new Unavailable(); }
      chunks.push(value);
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export function json(value, status = 200, headers = {}) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } }); }
export function unavailable(status = 503) { return json({ error: 'Connection unavailable. Please try again or reconnect.' }, status); }
export function parseList(value) { try { const result = JSON.parse(value || '[]'); return Array.isArray(result) && result.every(s => typeof s === 'string') ? result : []; } catch { return []; } }
export function enabled(env) { return env.PARTICIPATION_ENABLED === 'true' && parseList(env.PILOT_OWNER_IDS).length > 0; }
