// LOCAL TEST ENTRY ONLY. Deliberately auto-consents synthetic accounts; never deploy.
import OAuthProvider, { getOAuthApi } from '@cloudflare/workers-oauth-provider';
import { DurableObject } from 'cloudflare:workers';
import { SerializedStore } from './serialized-store.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

const issuer = 'https://issuer.example';
const resource = issuer + '/mcp';
const scope = 'commons.replies.write';
const redirect = 'https://client.example/callback';
let race;
const challengeResult = () => ({ isError: true, content: [{ type: 'text', text: 'Connect your Commons account.' }], _meta: { 'mcp/www_authenticate': [`Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Authentication required"`] } });
const tools = [['read_fixture', [{ type: 'noauth' }]], ['status_fixture', [{ type: 'oauth2', scopes: [scope] }]]].map(([name, securitySchemes]) => ({
  name, description: 'Synthetic offline diagnostic', inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  securitySchemes, _meta: { securitySchemes }, annotations: { readOnlyHint: true }
}));

async function mcp(request, env) {
  const server = new Server({ name: 'offline-mixed-spike', version: '0.0.0' }, { capabilities: { tools: {} } });
  // Public low-level SDK API preserves extension fields, without monkey-patching internals.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (!tools.some(t => t.name === params.name) || Object.keys(params.arguments ?? {}).length) return { isError: true, content: [{ type: 'text', text: 'Invalid fixture request.' }] };
    if (params.name === 'read_fixture') return { content: [{ type: 'text', text: 'public fixture' }] };
    try {
      const header = request.headers.get('authorization') || '';
      if (!header.startsWith('Bearer ')) return challengeResult();
      const token = await env.OAUTH_PROVIDER.unwrapToken(header.slice(7));
      const audience = Array.isArray(token?.audience) ? token.audience : [token?.audience];
      if (!token || !audience.includes(resource) || !token.scope.includes(scope)) return challengeResult();
      return { content: [{ type: 'text', text: 'connected fixture voice' }] };
    } catch { return { isError: true, content: [{ type: 'text', text: 'Connection unavailable.' }] }; }
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try { return await transport.handleRequest(request); }
  finally { await server.close(); }
}

const providerOptions = {
  apiRoute: '/protected-route-only', apiHandler: { fetch: () => Response.json({ authorized: true }) },
  authorizeEndpoint: '/authorize', tokenEndpoint: '/token', clientIdMetadataDocumentEnabled: true,
  accessTokenTTL: 900, refreshTokenTTL: 604800, scopesSupported: [scope],
  resourceMetadata: { resource, scopes_supported: [scope] }, onError: () => {},
  defaultHandler: { async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/fixture/arm-race') {
      race = { reads: 0 };
      return Response.json({ armed: true });
    }
    if (url.pathname === '/mcp') return mcp(request, env);
    if (url.pathname === '/fixture/authorize') {
      const client = await env.OAUTH_PROVIDER.createClient({ redirectUris: [redirect], tokenEndpointAuthMethod: 'none', grantTypes: ['authorization_code', 'refresh_token'], responseTypes: ['code'] });
      const params = new URLSearchParams({ client_id: client.clientId, redirect_uri: redirect, response_type: 'code', scope, state: 'fixture-state', code_challenge: url.searchParams.get('challenge'), code_challenge_method: 'S256', resource });
      const parsed = await env.OAUTH_PROVIDER.parseAuthRequest(new Request(issuer + '/authorize?' + params));
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({ request: parsed, userId: 'fixture-owner', scope: [scope], metadata: {}, props: { capability: 'SYNTHETIC_PRIVATE_CAPABILITY' }, revokeExistingGrants: false });
      return Response.json({ client_id: client.clientId, code: new URL(redirectTo).searchParams.get('code') });
    }
    if (url.pathname === '/fixture/egress') {
      const response = await fetch('https://blocked.example/');
      return new Response(await response.text(), { status: response.status });
    }
    return new Response('Not found', { status: 404 });
  } }
};
const provider = new OAuthProvider(providerOptions);
function directFetch(request, env, ctx) {
  // Deterministic fault injection: let both token requests read the same real KV
  // snapshot before either proceeds. This models a valid storage interleaving.
  if (race && new URL(request.url).pathname === '/token') {
    const original = env.OAUTH_KV;
    const barrier = race;
    env = { ...env, OAUTH_KV: {
      async get(key, options) {
        const result = await original.get(key, options);
        if (key.startsWith('grant:') && barrier.reads < 2) {
          barrier.reads++;
          if (barrier.reads === 2) race = undefined;
          const deadline = Date.now() + 5000;
          while (barrier.reads < 2) {
            if (Date.now() > deadline) throw new Error('Fixture barrier timed out');
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
        return result;
      },
      put: (...args) => original.put(...args), delete: (...args) => original.delete(...args), list: (...args) => original.list(...args)
    } };
  }
  return provider.fetch(request, env, ctx);
}
export class FixtureOAuthBroker extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.providerEnv = { ...env, OAUTH_KV: new SerializedStore(ctx.storage) };
    this.providerEnv.OAUTH_PROVIDER = getOAuthApi(providerOptions, this.providerEnv);
  }
  fetch(request) {
    // Serialize the ENTIRE provider operation including asynchronous crypto.
    // Merely routing KV writes through an actor would leave read/modify/write races.
    return this.ctx.blockConcurrencyWhile(async () => {
      try { return await provider.fetch(request, this.providerEnv, this.ctx); }
      catch { return new Response('OAuth temporarily unavailable', { status: 503 }); }
    });
  }
  inspectToken(token) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const decoded = await this.providerEnv.OAUTH_PROVIDER?.unwrapToken(token);
      return decoded ? { audience: decoded.audience, scope: decoded.scope } : null;
    });
  }
}
export default { fetch(request, env, ctx) {
  if (env.SERIALIZED) {
    const broker = env.BROKER.get(env.BROKER.idFromName('offline-pilot'));
    if (new URL(request.url).pathname === '/mcp') return mcp(request, { OAUTH_PROVIDER: {
      unwrapToken(token) {
        if (request.headers.has('x-fixture-auth-unavailable')) throw new Error('synthetic-secret-bearing-outage');
        return broker.inspectToken(token);
      }
    } });
    return broker.fetch(request);
  }
  return directFetch(request, env, ctx);
} };
