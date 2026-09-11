import './loopback-only.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { boundedText, enabled, ownerAllowed } from '../../../mcp-server-the-commons/hosted/limits.js';
const ISSUER = 'https://mcp.jointhecommons.space', SITE = 'https://jointhecommons.space';
const clientId = 'https://chatgpt.com/oauth/client.json', callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
const owner = '11111111-1111-4111-8111-111111111111', session = '22222222-2222-4222-8222-222222222222', voice = '33333333-3333-4333-8333-333333333333';
const draft = '44444444-4444-4444-8444-444444444444', discussion = '55555555-5555-4555-8555-555555555555', parent = '66666666-6666-4666-8666-666666666666';
const anonKey = 'header.' + Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url') + '.fixture';
const jwt = (sessionId = session, user = owner) => 'header.' + Buffer.from(JSON.stringify({ sub: user, session_id: sessionId, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.fixture';
test('hosted build: default-off, consent, protected tools, replay and revocation', { timeout: 60000 }, async t => {
  const output = await build({ entryPoints: [fileURLToPath(new URL('../../../mcp-server-the-commons/hosted/index.js', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', mainFields: ['module','main'], external: ['cloudflare:workers'] });
  let releaseStatus, statusStarted;
  const calls = []; let grant; let approved = false; let revoked = false; let unavailableGrant = false;
  const env = { PARTICIPATION_ENABLED: 'true', PARTICIPATION_ACCESS: 'all', PILOT_OWNER_IDS: '[]', OAUTH_CLIENT_IDS: JSON.stringify([clientId]), SUPABASE_ANON_KEY: anonKey };
  const service = async request => {
    const url = new URL(request.url);
    if (url.href === clientId) return Response.json({ client_id: clientId, client_name: 'ChatGPT fixture', redirect_uris: [callback], token_endpoint_auth_method: 'none', grant_types: ['authorization_code','refresh_token'], response_types: ['code'] });
    assert.equal(url.origin, 'https://dfephsfberzadihcrhal.supabase.co', 'unexpected outbound host');
    if (url.pathname === '/auth/v1/user') return Response.json({ id: JSON.parse(Buffer.from(request.headers.get('authorization').split('.')[1], 'base64url')).sub });
    if (url.pathname === '/rest/v1/ai_identities') { assert.equal(url.searchParams.get('select'), 'id,name,model'); return Response.json([{ id: voice, name: 'Fixture voice', model: 'GPT' }]); }
    assert.ok(url.pathname.startsWith('/rest/v1/rpc/remote_mcp_'), 'unexpected upstream path');
    const name = url.pathname.split('/').at(-1); const args = await request.json(); calls.push({ name, args });
    if (name === 'remote_mcp_create_grant') { grant = args; return Response.json({ connection_id: args.p_connection_id, voice_id: args.p_voice_id, expires_at: new Date(Date.now()+604800000).toISOString() }); }
    if (name === 'remote_mcp_revoke') { revoked = true; return Response.json({ revoked: true }); }
    if (name === 'remote_mcp_approve') { approved = true; return Response.json({ draft_id: draft, revision: 1, payload_hash: 'a'.repeat(64), approved_at: new Date().toISOString() }); }
    if (revoked) return Response.json({ message: 'synthetic-private-error' }, { status: 400 });
    if (name === 'remote_mcp_check_grant') return unavailableGrant ? Response.json({ error: 'synthetic-private-error' }, { status: 503 }) : Response.json({ active: true });
    if (name === 'remote_mcp_status' && releaseStatus) { statusStarted(); await releaseStatus; }
    if (name === 'remote_mcp_status') return Response.json({ connection_id: grant.p_connection_id, voice_id: voice, voice_name: 'Fixture voice', expires_at: new Date(Date.now()+604800000).toISOString() });
    if (name === 'remote_mcp_prepare') return Response.json({ draft_id: draft, revision: 1, payload_hash: 'a'.repeat(64), expires_at: new Date(Date.now()+600000).toISOString(), capability: 'MUST_NOT_LEAK' });
    if (name === 'remote_mcp_publish') return approved ? Response.json({ post_id: parent, discussion_id: discussion, draft_id: draft, revision: 1 }) : Response.json({ message: 'approval required' }, { status: 400 });
    if (name === 'remote_mcp_receipt') return Response.json({ published: false, draft_id: draft });
    return Response.json([]);
  };
  const make = vars => new Miniflare(convertV4MiniflareOptions({ modules: true, script: output.outputFiles[0].text, compatibilityDate: '2026-09-07', compatibilityFlags: ['global_fetch_strictly_public'], cf: false, host: '127.0.0.1', durableObjects: { OAUTH_BROKER: { className: 'RemoteOAuthBroker', useSQLite: true } }, bindings: vars, outboundService: service }));
  const mf = make(env); t.after(() => mf.dispose());
  const request = (path, init) => mf.dispatchFetch(ISSUER+path, init);
  const rpc = async (name, args = {}, token) => {
    const response = await request('/mcp', { method: 'POST', headers: { 'Content-Type':'application/json', Accept:'application/json, text/event-stream', ...(token? { Authorization:'Bearer '+token } : {}) }, body: JSON.stringify({ jsonrpc:'2.0',id:1,method:name.startsWith('tools/') ? name : 'tools/call',params:name.startsWith('tools/') ? args : { name,arguments:args } }) });
    return (await response.json()).result;
  };
  await t.test('disabled entry keeps exactly 14 public tools and never touches auth backend', async () => {
    const disabled = make({ ...env, PARTICIPATION_ENABLED:'false' });
    try {
      const response = await disabled.dispatchFetch(ISSUER+'/mcp', { method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}) });
      assert.equal((await response.json()).result.tools.length,14); assert.equal(calls.length,0);
      assert.equal((await disabled.dispatchFetch(ISSUER+'/authorize')).status,404);
    } finally { await disabled.dispose(); }
  });
  await t.test('enabled catalog has 14 noauth + 4 scope-protected declarations', async () => {
    const catalog = (await rpc('tools/list')).tools;
    assert.equal(catalog.length,18); assert.equal(catalog.filter(t=>t.securitySchemes[0].type==='noauth').length,14);
    for(const tool of catalog) assert.deepEqual(tool.securitySchemes,tool._meta.securitySchemes);
    assert.ok((await rpc('prepare_reply',{discussion_id:discussion,parent_id:parent,content:'reply'}))._meta['mcp/www_authenticate']);
    assert.equal(calls.length,0);
  });
  const verifier='v'.repeat(64); const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
  const query = new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'commons.connection.read commons.replies.write',state:'state',code_challenge:challenge,code_challenge_method:'S256',resource:ISSUER+'/mcp'});
  let cookie, csrf, authorization;
  const connect = (path, body, extra = {}) => request(path,{method:'POST',headers:{'Content-Type':'application/json',Origin:SITE,Authorization:'Bearer '+jwt(),Cookie:cookie,...extra},body:JSON.stringify(body)});
  await t.test('authorization binds HttpOnly transaction cookie and explicit owner context', async () => {
    const response=await request('/authorize?'+query,{redirect:'manual'});
    assert.equal(response.status,303); assert.equal(response.headers.get('location'),SITE+'/remote-connect.html');
    const setCookie=response.headers.get('set-cookie'); assert.match(setCookie,/HttpOnly/); assert.match(setCookie,/SameSite=Strict/); cookie=setCookie.split(';')[0];
    const context=await (await connect('/connect/context',{})).json();
    assert.equal(context.voices[0].id,voice); assert.deepEqual(context.scopes,['commons.connection.read','commons.replies.write']); csrf=context.csrf; assert.ok(csrf); assert.equal(calls.length,0);
  });
  await t.test('origin, CSRF and session substitutions cannot create a grant', async () => {
    assert.equal((await connect('/connect/complete',{voice_id:voice})).status,403);
    assert.equal((await connect('/connect/complete',{voice_id:voice},{'X-Commons-CSRF':csrf,Origin:'https://evil.example'})).status,403);
    assert.equal((await connect('/connect/complete',{voice_id:voice},{'X-Commons-CSRF':csrf,Authorization:'Bearer '+jwt(parent)})).status,403);
    assert.equal(calls.length,0);
    const badToken = 'header.' + Buffer.from(JSON.stringify({sub:owner,session_id:session})).toString('base64url') + '.fixture';
    assert.equal((await connect('/connect/context',{}, {Authorization:'Bearer '+badToken})).status,503);
    assert.equal(calls.length,0);
  });
  await t.test('consent creates hashed capability and issues exact client callback once', async () => {
    const response=await connect('/connect/complete',{voice_id:voice},{'X-Commons-CSRF':csrf});
    assert.equal(response.status,200,await response.clone().text());
    authorization=new URL((await response.json()).redirect_to);
    assert.equal(authorization.origin,'https://chatgpt.com'); assert.equal(authorization.searchParams.get('state'),'state'); assert.equal(authorization.searchParams.get('iss'),ISSUER);
    assert.match(grant.p_capability_hash,/^[a-f0-9]{64}$/); assert.equal(grant.p_voice_id,voice); assert.equal(Object.hasOwn(grant,'p_capability'),false);
    assert.deepEqual(grant.p_scopes,['commons.connection.read','commons.replies.write']);
    assert.equal((await connect('/connect/complete',{voice_id:voice},{'X-Commons-CSRF':csrf})).status,410);
  });
  let token, refreshToken;
  await t.test('OAuth token protects exact draft operations and filters private backend fields', async () => {
    const exchange=()=>request('/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:authorization.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier,resource:ISSUER+'/mcp'})});
    const exchanges=await Promise.all([exchange(),exchange()]);
    assert.deepEqual(exchanges.map(r=>r.status).sort(),[200,400],'authorization code is single-use under broker concurrency');
    const response=exchanges.find(r=>r.status===200);
    const body=await response.json(); assert.equal(response.status,200,JSON.stringify(body)); token=body.access_token; refreshToken=body.refresh_token;
    const prepared=await rpc('prepare_reply',{discussion_id:discussion,parent_id:parent,content:'Exact reply'},token);
    assert.equal(prepared.isError,undefined,JSON.stringify(prepared)); assert.equal(JSON.stringify(prepared).includes('MUST_NOT_LEAK'),false);
    assert.match(prepared.content[0].text,/remote-review.html/);
    const before=calls.length;
    assert.equal((await rpc('publish_approved_reply',{draft_id:draft,revision:1,approved:true},token)).isError,true); assert.equal(calls.length,before);
    assert.equal((await rpc('publish_approved_reply',{draft_id:draft,revision:1},token)).isError,true);
    await connect('/participation/approve',{draft_id:draft,revision:1,payload_hash:'a'.repeat(64)});
    const published=await rpc('publish_approved_reply',{draft_id:draft,revision:1},token); assert.equal(published.isError,undefined); assert.match(published.content[0].text,/discussion.html/);
  });
  await t.test('a stalled protected database call does not hold the shared OAuth lock', async () => {
    let release;
    releaseStatus = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { statusStarted = resolve; });
    const pending = rpc('connection_status', {}, token);
    try {
      await started;
      const discovery = await Promise.race([request('/.well-known/oauth-authorization-server'), new Promise((_, reject) => setTimeout(() => reject(new Error('shared lock held by database call')), 1500))]);
      assert.equal(discovery.status, 200);
    } finally { release(); releaseStatus = null; await pending; }
  });
  const refresh = value => request('/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:value,scope:'commons.connection.read',resource:ISSUER+'/mcp'})});
  await t.test('concurrent refresh redeems once and previous-token replay cannot issue again', async () => {
    const responses=await Promise.all([refresh(refreshToken),refresh(refreshToken)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
    const next=await responses.find(r=>r.status===200).json();
    const before=calls.length;
    assert.equal((await rpc('prepare_reply',{discussion_id:discussion,parent_id:parent,content:'Not authorized'},next.access_token)).isError,true);
    assert.equal(calls.length,before,'read-only access token must stop before write RPC');
    assert.equal((await refresh(refreshToken)).status,400);
    assert.equal(calls.length,before,'replay must stop before privileged execution');
    refreshToken=next.refresh_token;
  });
  await t.test('uncertain failed refresh remains consumed and requires reconnect', async () => {
    unavailableGrant=true;
    assert.equal((await refresh(refreshToken)).status,503);
    unavailableGrant=false;
    const before=calls.length;
    assert.equal((await refresh(refreshToken)).status,400);
    assert.equal(calls.length,before);
  });
  await t.test('database revocation refuses further protected calls; public read remains available', async () => {
    await connect('/participation/revoke',{connection_id:grant.p_connection_id});
    const result=await rpc('connection_status',{},token); assert.equal(result.isError,true); assert.equal(JSON.stringify(result).includes('synthetic-private-error'),false);
    assert.equal((await rpc('get_orientation',{},token)).isError,undefined);
  });
  await t.test('write-only grant can exchange via lifecycle probe without granting private read scope', async () => {
    revoked=false;
    query.set('scope','commons.replies.write');
    const start=await request('/authorize?'+query,{redirect:'manual'});
    assert.equal(start.status,303);cookie=start.headers.get('set-cookie').split(';')[0];
    const context=await (await connect('/connect/context',{})).json();csrf=context.csrf;
    assert.deepEqual(context.scopes,['commons.replies.write']);
    const consent=await connect('/connect/complete',{voice_id:voice},{'X-Commons-CSRF':csrf});
    const url=new URL((await consent.json()).redirect_to);
    const response=await request('/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier,resource:ISSUER+'/mcp'})});
    const issued=await response.json();assert.equal(response.status,200,JSON.stringify(issued));
    assert.deepEqual(grant.p_scopes,['commons.replies.write']);
    const before=calls.length;
    assert.equal((await rpc('connection_status',{},issued.access_token)).isError,true);
    assert.equal(calls.length,before);
    assert.equal((await rpc('prepare_reply',{discussion_id:discussion,parent_id:parent,content:'Write-only draft'},issued.access_token)).isError,undefined);
  });
  await t.test('OAuth IP allowance is isolated and cannot exhaust a protected owner allowance', async () => {
    for(let n=0;n<241;n++) await request('/authorize?client_id=invalid', {headers:{'cf-connecting-ip':'192.0.2.1'}});
    assert.equal((await request('/authorize?'+query,{redirect:'manual',headers:{'cf-connecting-ip':'192.0.2.2'}})).status,303);
    assert.equal((await rpc('connection_status',{},token)).isError,undefined);
  });
  await t.test('one owner exhausting their allowance does not block another owner', async () => {
    let refused = 0;
    for (let n = 0; n < 241; n++) if ((await rpc('connection_status', {}, token)).isError) refused++;
    assert.ok(refused > 0);
    const secondOwner = '77777777-7777-4777-8777-777777777777';
    query.set('scope', 'commons.connection.read');
    const start = await request('/authorize?' + query, {redirect:'manual'});
    assert.equal(start.status,303); cookie=start.headers.get('set-cookie').split(';')[0];
    const extra = {Authorization:'Bearer '+jwt(session,secondOwner)};
    const context=await (await connect('/connect/context',{},extra)).json(); csrf=context.csrf;
    const consent=await connect('/connect/complete',{voice_id:voice},{...extra,'X-Commons-CSRF':csrf});
    assert.equal(consent.status,200);
    const url=new URL((await consent.json()).redirect_to);
    const response=await request('/token',{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:verifier,resource:ISSUER+'/mcp'})});
    assert.equal(response.status,200);
    const issued=await response.json();
    assert.equal((await rpc('connection_status',{},issued.access_token)).isError,undefined);
  });
});

test('participation access is explicit and preserves the pilot fallback', () => {
  assert.equal(enabled({PARTICIPATION_ACCESS:'all'}),false);
  assert.equal(enabled({PARTICIPATION_ENABLED:'true',PARTICIPATION_ACCESS:'typo'}),false);
  assert.equal(enabled({PARTICIPATION_ENABLED:'true',PARTICIPATION_ACCESS:'all'}),true);
  assert.equal(ownerAllowed({PARTICIPATION_ACCESS:'all'},'invalid'),false);
  assert.equal(ownerAllowed({PILOT_OWNER_IDS:JSON.stringify([owner])},parent),false);
});

test('body reader deadline rejects a stalled stream and cancels without waiting on its source', async () => {
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;return new Promise(()=>{});}});
  const started=Date.now();
  await assert.rejects(boundedText(body,65536,30),/Connection unavailable/);
  assert.equal(cancelled,true);
  assert.ok(Date.now()-started<1000);
});

test('operation deadline releases serialization and late backend work cannot advance consent', {timeout:10000}, async t => {
  const built=await build({entryPoints:[fileURLToPath(new URL('../../../mcp-server-the-commons/hosted/index.js',import.meta.url))],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],external:['cloudflare:workers'],plugins:[{
    name:'shorten-only-test-deadline',setup(build){build.onLoad({filter:/oauth-broker\.js$/},async args=>{
      const source=await readFile(args.path,'utf8');
      assert.ok(source.includes('}, 20000);'),'production serialized deadline remains 20 seconds');
      return {contents:source.replace('}, 20000);','}, 100);'),loader:'js'};
    });}
  }]});
  let slow=true, voiceReads=0;
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-07',compatibilityFlags:['global_fetch_strictly_public'],cf:false,host:'127.0.0.1',durableObjects:{OAUTH_BROKER:{className:'RemoteOAuthBroker',useSQLite:true}},bindings:{PARTICIPATION_ENABLED:'true',PILOT_OWNER_IDS:JSON.stringify([owner]),OAUTH_CLIENT_IDS:JSON.stringify([clientId]),SUPABASE_ANON_KEY:anonKey},outboundService:async request=>{
    const url=new URL(request.url);
    if(url.href===clientId)return Response.json({client_id:clientId,client_name:'ChatGPT fixture',redirect_uris:[callback],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
    assert.equal(url.origin,'https://dfephsfberzadihcrhal.supabase.co');
    if(url.pathname==='/auth/v1/user') {if(slow)await new Promise(resolve=>setTimeout(resolve,250));return Response.json({id:owner});}
    assert.equal(url.pathname,'/rest/v1/ai_identities');voiceReads++;return Response.json([{id:voice,name:'Fixture',model:'GPT'}]);
  }}));
  t.after(()=>mf.dispose());
  const query=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:'commons.connection.read',code_challenge:'v'.repeat(43),code_challenge_method:'S256'});
  const start=await mf.dispatchFetch(ISSUER+'/authorize?'+query,{redirect:'manual'});
  assert.equal(start.status,303);
  const cookie=start.headers.get('set-cookie').split(';')[0];
  const context=()=>mf.dispatchFetch(ISSUER+'/connect/context',{method:'POST',headers:{'Content-Type':'application/json',Origin:SITE,Authorization:'Bearer '+jwt(),Cookie:cookie},body:'{}'});
  assert.equal((await context()).status,503);
  slow=false;
  assert.equal((await context()).status,200,'new request succeeds after timeout');
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(voiceReads,1,'expired operation never proceeds to voice selection after late auth response');
});
