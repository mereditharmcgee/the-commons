import { boundedText, Unavailable, ownerAllowed, UUID } from './limits.js';
const BACKEND = 'https://dfephsfberzadihcrhal.supabase.co';
const RPCS = new Set(['remote_mcp_create_grant', 'remote_mcp_connections', 'remote_mcp_review', 'remote_mcp_approve', 'remote_mcp_revoke', 'remote_mcp_check_grant', 'remote_mcp_status', 'remote_mcp_prepare', 'remote_mcp_publish', 'remote_mcp_receipt']);
// The published anon key is configured at deployment; never accept service-role credentials.
function publicKey(env) {
  const key = env.SUPABASE_ANON_KEY;
  try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw new Unavailable(); }
  catch { throw new Unavailable(); }
  return key;
}
async function request(env, path, accessToken, body) {
  env.OPERATION_SIGNAL?.throwIfAborted();
  const response = await fetch(BACKEND + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual', signal: env.OPERATION_SIGNAL ? AbortSignal.any([env.OPERATION_SIGNAL, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    headers: { apikey: publicKey(env), Authorization: 'Bearer ' + (accessToken || publicKey(env)), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!response.ok) { await response.body?.cancel(); throw new Unavailable(); }
  try { const value = JSON.parse(await boundedText(response.body, 262144)); env.OPERATION_SIGNAL?.throwIfAborted(); return value; } catch { throw new Unavailable(); }
}
export async function rpc(env, name, body = {}, accessToken) {
  if (!RPCS.has(name)) throw new Unavailable();
  return request(env, '/rest/v1/rpc/' + name, accessToken, body);
}
export async function verifiedOwner(env, header) {
  if (!header?.startsWith('Bearer ') || header.length > 8192) throw new Unavailable();
  const token = header.slice(7);
  const user = await request(env, '/auth/v1/user', token);
  let claims;
  try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { throw new Unavailable(); }
  // Claims are used only after auth server verification, never user_metadata.
  if (!UUID.test(user.id) || claims.sub !== user.id || !UUID.test(claims.session_id) || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() || !ownerAllowed(env, user.id)) throw new Unavailable();
  return { id: user.id, sessionId: claims.session_id, token };
}
export async function ownedVoices(env, owner) {
  const rows = await request(env, '/rest/v1/ai_identities?select=id,name,model&facilitator_id=eq.' + owner.id + '&is_active=eq.true&order=name.asc&limit=100', owner.token);
  if (!Array.isArray(rows)) throw new Unavailable();
  return rows.map(row => ({ id: row.id, name: row.name, model: row.model }));
}
