import './runtime.js';
import { MemoryKV, documents } from './runtime.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { default: OAuthProvider, getOAuthApi } = await import('@cloudflare/workers-oauth-provider');
const origin = 'https://issuer.example';
const resource = origin + '/mcp';
const redirect = 'https://client.example/callback';
const verifier = 'v'.repeat(64);
const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
function fixture() {
  const env = { OAUTH_KV: new MemoryKV() };
  const options = {
    apiRoute: '/mcp', apiHandler: { fetch: () => Response.json({ authorized: true }) },
    defaultHandler: { fetch: () => new Response('fixture', { status: 404 }) },
    authorizeEndpoint: '/authorize', tokenEndpoint: '/token',
    accessTokenTTL: 900, refreshTokenTTL: 604800,
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: ['commons.replies.write'],
    resourceMetadata: { resource, scopes_supported: ['commons.replies.write'] },
    onError: () => {} // Never log raw provider descriptions in the candidate adapter.
  };
  const provider = new OAuthProvider(options);
  const api = getOAuthApi(options, env);
  const request = (path, init) => provider.fetch(new Request(origin + path, init), env, { waitUntil() {} });
  const token = async body => {
    const response = await request('/token', { method: 'POST', body: new URLSearchParams(body) });
    return { status: response.status, body: await response.json() };
  };
  return { env, api, request, token };
}
async function authorize(f, overrides = {}) {
  const client = await f.api.createClient({ redirectUris: [redirect], tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] });
  const params = { client_id: client.clientId, redirect_uri: redirect, response_type: 'code', scope: 'commons.replies.write', state: 'fixture-state', code_challenge: challenge, code_challenge_method: 'S256', resource, ...overrides };
  const parsed = await f.api.parseAuthRequest(new Request(origin + '/authorize?' + new URLSearchParams(params)));
  const result = await f.api.completeAuthorization({ request: parsed, userId: 'fixture-owner', scope: ['commons.replies.write'], metadata: {}, props: { capability: 'SYNTHETIC_PRIVATE_CAPABILITY' }, revokeExistingGrants: false });
  const url = new URL(result.redirectTo);
  return { client, url, exchange: { grant_type: 'authorization_code', code: url.searchParams.get('code'), client_id: client.clientId, redirect_uri: redirect, code_verifier: verifier, resource } };
}
test('network guard rejects production and all unregistered destinations', async () => {
  await assert.rejects(fetch('https://mcp.jointhecommons.space/health'), /network blocked/);
});
test('discovery pins resource, issuer and S256; unauthenticated API challenges', async () => {
  const f = fixture();
  const meta = await (await f.request('/.well-known/oauth-authorization-server')).json();
  assert.equal(meta.issuer, origin);
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  const protectedMeta = await (await f.request('/.well-known/oauth-protected-resource')).json();
  assert.equal(protectedMeta.resource, resource);
  const response = await f.request('/mcp');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /resource_metadata/);
});
test('authorization code, encrypted props, replay rejection, refresh and revocation', async () => {
  const f = fixture(); const auth = await authorize(f);
  assert.equal(auth.url.searchParams.get('iss'), origin);
  assert.equal(auth.url.searchParams.get('state'), 'fixture-state');
  const issued = await f.token(auth.exchange);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const token = issued.body.access_token;
  assert.equal((await f.api.unwrapToken(token)).grant.props.capability, 'SYNTHETIC_PRIVATE_CAPABILITY');
  const storage = JSON.stringify([...f.env.OAUTH_KV.rows]);
  for (const secret of [token, issued.body.refresh_token, 'SYNTHETIC_PRIVATE_CAPABILITY']) assert.equal(storage.includes(secret), false);
  const refreshed = await f.token({ grant_type: 'refresh_token', refresh_token: issued.body.refresh_token, client_id: auth.client.clientId, resource });
  assert.equal(refreshed.status, 200);
  const summary = await f.api.unwrapToken(refreshed.body.access_token);
  await f.api.revokeGrant(summary.grantId, summary.userId);
  assert.equal(await f.api.unwrapToken(refreshed.body.access_token), null);
});
test('authorization code replay revokes the entire original grant', async () => {
  const f = fixture(); const auth = await authorize(f);
  const issued = await f.token(auth.exchange);
  assert.equal((await f.token(auth.exchange)).status, 400);
  assert.equal(await f.api.unwrapToken(issued.body.access_token), null);
});
test('concurrent code redemption diagnostic: KV fixture has no atomic consume', async () => {
  const f = fixture(); const auth = await authorize(f);
  const results = await Promise.all([f.token(auth.exchange), f.token(auth.exchange)]);
  // Documents a limitation, NOT an acceptable production security property.
  assert.deepEqual(results.map(r => r.status), [200, 200]);
});
test('wrong redirect, wrong resource and plain PKCE are rejected at authorization', async () => {
  for (const overrides of [{ redirect_uri: redirect + '/other' }, { resource: origin + '/other' }, { code_challenge_method: 'plain' }]) {
    await assert.rejects(authorize(fixture(), overrides));
  }
});
test('wrong verifier and resource fail token exchange', async () => {
  for (const overrides of [{ code_verifier: 'wrong' }, { resource: origin + '/other' }]) {
    const f = fixture(); const auth = await authorize(f);
    assert.equal((await f.token({ ...auth.exchange, ...overrides })).status, 400);
  }
});
test('CIMD public-client method negotiation uses fixture metadata only', async () => {
  const id = 'https://client.example/oauth/client.json';
  documents.set(id, { client_id: id, client_name: 'Offline fixture', redirect_uris: [redirect], token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['private_key_jwt', 'none'], grant_types: ['authorization_code'], response_types: ['code'] });
  const client = await fixture().api.lookupClient(id);
  assert.equal(client.tokenEndpointAuthMethod, 'none');
  documents.set(id, { ...documents.get(id), token_endpoint_auth_methods_supported: ['private_key_jwt'] });
  await assert.rejects(fixture().api.lookupClient(id));
  documents.clear();
});
test('CIMD is refused without the Workers public-fetch compatibility flag', async () => {
  Cloudflare.compatibilityFlags.global_fetch_strictly_public = false;
  try { await assert.rejects(fixture().api.lookupClient('https://client.example/oauth/client.json'), /compatibility flag/); }
  finally { Cloudflare.compatibilityFlags.global_fetch_strictly_public = true; }
});
test('previous refresh token is accepted for recovery; grant expiry is not extended', async () => {
  const f = fixture(); const auth = await authorize(f);
  const issued = await f.token(auth.exchange);
  const grantKey = [...f.env.OAUTH_KV.rows.keys()].find(k => k.startsWith('grant:'));
  const expiry = (await f.env.OAUTH_KV.get(grantKey, 'json')).expiresAt;
  const args = { grant_type: 'refresh_token', refresh_token: issued.body.refresh_token, client_id: auth.client.clientId, resource };
  assert.equal((await f.token(args)).status, 200);
  assert.equal((await f.token(args)).status, 200);
  assert.equal((await f.env.OAUTH_KV.get(grantKey, 'json')).expiresAt, expiry);
  const grant = await f.env.OAUTH_KV.get(grantKey, 'json');
  grant.expiresAt = Math.floor(Date.now() / 1000) - 1;
  await f.env.OAUTH_KV.put(grantKey, JSON.stringify(grant));
  assert.equal((await f.token(args)).status, 400);
});
test('expired access token and provider storage outage cannot authorize API', async () => {
  const f = fixture(); const auth = await authorize(f);
  const issued = await f.token(auth.exchange);
  for (const [key, row] of f.env.OAUTH_KV.rows) if (key.startsWith('token:')) row.expiry = 0;
  assert.equal(await f.api.unwrapToken(issued.body.access_token), null);
  f.env.OAUTH_KV.get = async () => { throw new Error('synthetic storage outage'); };
  await assert.rejects(f.api.unwrapToken(issued.body.access_token), /storage outage/);
});
