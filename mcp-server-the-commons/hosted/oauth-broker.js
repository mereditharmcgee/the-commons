import { DurableObject } from 'cloudflare:workers';
import OAuthProvider, { getOAuthApi, OAuthError } from '@cloudflare/workers-oauth-provider';
import { OAuthStore } from './oauth-store.js';
import { ISSUER, SITE, RESOURCE, SCOPES, boundedText, randomSecret, digest, json, unavailable, parseList, enabled, Unavailable, UUID } from './limits.js';
import { rpc, verifiedOwner, ownedVoices } from './backend.js';
import { protectedTools } from './participation.js';

const COOKIE = '__Host-commons-connect';
function cookie(request) {
  const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}
const cookieHeader = value => `${COOKIE}=${value}; Path=/; Max-Age=${value ? 600 : 0}; Secure; HttpOnly; SameSite=Strict`;
function exactObject(value, fields) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => fields.includes(k)); }

export class RemoteOAuthBroker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.store = new OAuthStore(ctx.storage);
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const result = await this.store.cleanup(200);
      if (result.more || (await this.store.list({ limit: 1 })).keys.length) await this.ctx.storage.setAlarm(Date.now() + 60000);
    });
  }
  async run(work, failed) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const controller = new AbortController();
      let timer;
      // Late provider continuations cannot mutate state after this operation
      // releases serialization. Each operation owns its provider and env.
      const guarded = Object.fromEntries(['get', 'put', 'delete', 'list'].map(name => [name, async (...args) => {
        controller.signal.throwIfAborted();
        const value = await this.store[name](...args);
        controller.signal.throwIfAborted();
        return value;
      }]));
      const operation = new BrokerOperation(this.ctx, { ...this.env, OPERATION_SIGNAL: controller.signal }, guarded);
      try {
        return await Promise.race([
          work(operation),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(new Unavailable()); reject(new Unavailable()); }, 20000); })
        ]);
      } catch { return failed(); }
      finally { clearTimeout(timer); controller.abort(new Unavailable()); }
    });
  }
  async fetch(request) {
    if (!enabled(this.env)) return unavailable(404);
    try {
      // Slow clients must never hold the singleton OAuth lock.
      if (request.body) request = new Request(request.url, { method: request.method, headers: request.headers, body: await boundedText(request.body) });
      return await this.run(operation => operation.fetch(request), () => unavailable());
    } catch { return unavailable(400); }
  }
  callTool(bearer, name, input, resource) {
    return this.run(operation => operation.callTool(bearer, name, input, resource), () => ({ failed: true }));
  }
}

class BrokerOperation {
  constructor(ctx, env, store) {
    this.ctx = ctx; this.env = env; this.store = store;
    this.providerEnv = { OAUTH_KV: this.store };
    this.options = {
      apiRoute: '/oauth/internal', apiHandler: { fetch: () => unavailable(404) },
      authorizeEndpoint: ISSUER + '/authorize', tokenEndpoint: ISSUER + '/token',
      resourceMetadata: { resource: RESOURCE, authorization_servers: [ISSUER], scopes_supported: SCOPES },
      scopesSupported: SCOPES, clientIdMetadataDocumentEnabled: true,
      accessTokenTTL: 900, refreshTokenTTL: 604800, onError: () => {},
      tokenExchangeCallback: async options => {
        if (options.grantType === 'authorization_code') {
          if (!this.codeKey || await this.store.get(this.codeKey)) throw new OAuthError('invalid_grant', { description: 'Authorization code already used' });
          await this.store.put(this.codeKey, '1', { expirationTtl: 604800 });
        }
        if (options.grantType === 'refresh_token') {
          // This callback follows provider validation/decryption but precedes
          // token issuance. Invalid random tokens cannot fill replay storage.
          if (!this.refreshKey || await this.store.get(this.refreshKey)) throw new OAuthError('invalid_grant', { description: 'Refresh token already used' });
          await this.store.put(this.refreshKey, '1', { expirationTtl: 604800 });
        }
        const props = options.props;
        const remaining = Math.floor((Date.parse(props?.expiresAt) - Date.now()) / 1000);
        if (!Number.isFinite(remaining) || remaining < 60 || !parseList(this.env.PILOT_OWNER_IDS).includes(options.userId)) throw new OAuthError('invalid_grant', { description: 'Connection expired' });
        // Database revocation is authoritative even when a client still has an access token.
        const status = await rpc(this.env, 'remote_mcp_check_grant', { p_connection_id: props.connectionId, p_capability: props.capability });
        if (status?.active !== true) throw new OAuthError('invalid_grant', { description: 'Connection unavailable' });
        return { accessTokenTTL: Math.min(900, remaining), ...(options.grantType === 'authorization_code' ? { refreshTokenTTL: remaining } : {}) };
      },
      defaultHandler: { fetch: request => this.authorize(request) }
    };
    this.provider = new OAuthProvider(this.options);
    this.helpers = getOAuthApi(this.options, this.providerEnv);
    this.providerEnv.OAUTH_PROVIDER = this.helpers;
  }
  allowedClient(id) {
    if (!parseList(this.env.OAUTH_CLIENT_IDS).includes(id)) return false;
    try { const url = new URL(id); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
  }
  async admission() {
    const key = 'rate:' + Math.floor(Date.now() / 60000);
    const count = Number(await this.store.get(key) || 0);
    if (count >= 120) throw new Unavailable();
    await this.store.put(key, String(count + 1), { expirationTtl: 120 });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 60000);
  }
  async fetch(request) {
      if (!enabled(this.env)) return unavailable(404);
      try {
        await this.admission();
        const url = new URL(request.url);
        if (url.origin !== ISSUER) return unavailable(400);
        if (url.pathname.startsWith('/connect/')) return await this.connect(request);
        if (url.pathname === '/token') {
          if (request.method !== 'POST') return unavailable(405);
          const raw = await boundedText(request.body);
          const type = request.headers.get('content-type') || '';
          const data = type.startsWith('application/json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
          if (!this.allowedClient(data.client_id)) return unavailable(400);
          if (data.grant_type === 'authorization_code') {
            if (typeof data.code !== 'string' || !data.code || data.code.length > 4096) return unavailable(400);
            this.codeKey = 'spent-code:' + await digest(data.code);
            if (await this.store.get(this.codeKey)) return unavailable(400);
          }
          if (data.grant_type === 'refresh_token') {
            if (typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 4096) return unavailable(400);
            const key = 'spent-refresh:' + await digest(data.refresh_token);
            if (await this.store.get(key)) return unavailable(400);
            // Consumed by the provider's pre-issuance callback, even when the
            // subsequent backend check or issuance fails or becomes uncertain.
            this.refreshKey = key;
          }
          request = new Request(request.url, { method: 'POST', headers: request.headers, body: raw });
        }
        return await this.provider.fetch(request, this.providerEnv, this.ctx);
      } catch { return unavailable(); }
  }
  async authorize(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/authorize' || request.method !== 'GET' || url.search.length > 8192 || !this.allowedClient(url.searchParams.get('client_id'))) return unavailable(400);
    const parsed = await this.helpers.parseAuthRequest(request);
    if (!parsed.scope?.length || parsed.scope.some(scope => !SCOPES.includes(scope))) return unavailable(400);
    // Pilot callback restriction is deliberate; no redirect supplied by a model is trusted.
    const redirect = new URL(parsed.redirectUri);
    if (redirect.protocol !== 'https:' || redirect.hostname !== 'chatgpt.com' || redirect.port || redirect.username || redirect.password || redirect.hash) return unavailable(400);
    const nonce = randomSecret();
    const key = 'pending:' + await digest(nonce);
    await this.store.put(key, JSON.stringify({ request: parsed, csrf: randomSecret(), expires: Date.now() + 600000, connectionId: crypto.randomUUID() }), { expirationTtl: 600 });
    return new Response(null, { status: 303, headers: { Location: SITE + '/remote-connect.html', 'Set-Cookie': cookieHeader(nonce), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
  async connect(request) {
    if (request.method !== 'POST' || request.headers.get('origin') !== SITE || !request.headers.get('content-type')?.startsWith('application/json')) return unavailable(403);
    const nonce = cookie(request); if (!nonce) return unavailable(400);
    const key = 'pending:' + await digest(nonce);
    const pending = await this.store.get(key, 'json');
    if (!pending || pending.expires <= Date.now()) return unavailable(410);
    const owner = await verifiedOwner(this.env, request.headers.get('authorization'));
    if (pending.ownerId && (pending.ownerId !== owner.id || pending.sessionId !== owner.sessionId)) return unavailable(403);
    const body = JSON.parse(await boundedText(request.body));
    const path = new URL(request.url).pathname;
    if (path === '/connect/context') {
      if (!exactObject(body, [])) return unavailable(400);
      pending.ownerId = owner.id; pending.sessionId = owner.sessionId;
      await this.store.put(key, JSON.stringify(pending), { expiration: Math.ceil(pending.expires / 1000) });
      const client = await this.helpers.lookupClient(pending.request.clientId);
      return json({ client_id: pending.request.clientId, client_name: String(client.clientName || 'ChatGPT').slice(0, 120), scopes: [...new Set(pending.request.scope)], csrf: pending.csrf, expires_at: new Date(pending.expires).toISOString(), voices: await ownedVoices(this.env, owner) });
    }
    if (path !== '/connect/complete' || !exactObject(body, ['voice_id']) || !UUID.test(body.voice_id) || pending.ownerId !== owner.id || pending.sessionId !== owner.sessionId || request.headers.get('x-commons-csrf') !== pending.csrf) return unavailable(403);
    // Consume before external work. A lost response requires a new explicit consent;
    // it cannot attach a second voice or replay the same pending transaction.
    await this.store.delete(key);
    const capability = randomSecret();
    let created = false;
    try {
      const grant = await rpc(this.env, 'remote_mcp_create_grant', {
        p_connection_id: pending.connectionId, p_voice_id: body.voice_id,
        p_capability_hash: await digest(capability), p_client_id: pending.request.clientId, p_resource: RESOURCE,
        p_transaction_hash: await digest(JSON.stringify([await digest(nonce), pending.request, owner.id, owner.sessionId])), p_scopes: pending.request.scope
      }, owner.token);
      created = true;
      if (grant.connection_id !== pending.connectionId || grant.voice_id !== body.voice_id || !Number.isFinite(Date.parse(grant.expires_at))) throw new Unavailable();
      const result = await this.helpers.completeAuthorization({ request: pending.request, userId: owner.id, metadata: { connectionId: pending.connectionId }, scope: pending.request.scope,
        props: { connectionId: pending.connectionId, capability, expiresAt: grant.expires_at }, revokeExistingGrants: false });
      return json({ redirect_to: result.redirectTo }, 200, { 'Set-Cookie': cookieHeader('') });
    } catch {
      if (created) { try { await rpc(this.env, 'remote_mcp_revoke', { p_connection_id: pending.connectionId }, owner.token); } catch { /* Grant expiry remains fail-closed; no bearer was delivered. */ } }
      return unavailable();
    }
  }
  async callTool(bearer, name, input, resource) {
      try {
        if (!enabled(this.env) || resource !== RESOURCE || typeof bearer !== 'string' || bearer.length > 4096) return { authRequired: true };
        await this.admission();
        const token = await this.helpers.unwrapToken(bearer);
        const tool = protectedTools.find(item => item.name === name);
        const audience = Array.isArray(token?.audience) ? token.audience : [token?.audience];
        if (!tool || !token || !audience.includes(RESOURCE) || !token.scope.includes(tool.scope) || !parseList(this.env.PILOT_OWNER_IDS).includes(token.userId) || !this.allowedClient(token.grant.clientId)) return { authRequired: true };
        const props = token.grant.props;
        if (!props || !Number.isFinite(Date.parse(props.expiresAt)) || Date.parse(props.expiresAt) <= Date.now()) return { authRequired: true };
        const args = tool.schema.parse(input);
        const value = await rpc(this.env, tool.rpc, { p_connection_id: props.connectionId, p_capability: props.capability, ...Object.fromEntries(Object.entries(args).map(([key, value]) => ['p_' + key, value])) });
        return { value };
      } catch { return { failed: true }; }
  }
}
