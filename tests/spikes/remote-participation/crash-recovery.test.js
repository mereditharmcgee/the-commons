import './loopback-only.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const base=fileURLToPath(new URL('./node_modules/',import.meta.url));
const client='https://chatgpt.com/oauth/client.json', callback='https://chatgpt.com/connector_platform_oauth_redirect';
const session='22222222-2222-4222-8222-222222222222', owner='11111111-1111-4111-8111-111111111111', voice='33333333-3333-4333-8333-333333333333';
const jwt='header.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const verifier='v'.repeat(64), challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');

// Kill only the fixture process we launched and its workerd descendants. No
// graceful Miniflare disposal runs before persistence is reopened.
async function terminate(child) {
 if(child.exitCode!==null || child.signalCode!==null)return;
 const ended=once(child,'exit');
 if(process.platform==='win32') {
  const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  const [code]=await once(killer,'exit');assert.equal(code,0);
 } else process.kill(-child.pid,'SIGKILL');
 await ended;
}
async function start(persist) {
 const child=fork(fileURLToPath(new URL('./crash-runtime-child.js',import.meta.url)),[persist],{stdio:['ignore','ignore','pipe','ipc'],windowsHide:true,detached:process.platform!=='win32'});
 let serial=0,checks=0;const pending=new Map();let checkpoint;
 const ready=new Promise((resolve,reject)=>{
  child.once('error',reject);child.once('exit',()=>reject(new Error('Fixture exited before ready')));
  child.on('message',m=>{if(m.ready)resolve();if(m.backendCheck)checks++;if(m.checkpoint)checkpoint?.();if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 });
 child.stderr.on('data',data=>process.stderr.write(data));
 await ready;
 return {child,get checks(){return checks;},request:(url,init)=>new Promise(resolve=>{const id=++serial;pending.set(id,resolve);child.send({id,path:url,init});}),checkpoint:()=>new Promise(resolve=>{checkpoint=resolve;})};
}
async function authorize(runtime) {
 const q=new URLSearchParams({client_id:client,redirect_uri:callback,response_type:'code',scope:'commons.connection.read',state:'fixture',code_challenge:challenge,code_challenge_method:'S256',resource:'https://mcp.jointhecommons.space/mcp'});
 const auth=await runtime.request('/authorize?'+q,{redirect:'manual'});assert.equal(auth.status,303);
 const headers={'Content-Type':'application/json',Origin:'https://jointhecommons.space',Authorization:'Bearer '+jwt,Cookie:auth.headers['set-cookie'].split(';')[0]};
 const context=await runtime.request('/connect/context',{method:'POST',headers,body:'{}'});assert.equal(context.status,200);
 headers['X-Commons-CSRF']=JSON.parse(context.body).csrf;
 return {path:'/connect/complete',init:{method:'POST',headers,body:JSON.stringify({voice_id:voice})}};
}
const tokenRequest=(type,value)=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:type,client_id:client,resource:'https://mcp.jointhecommons.space/mcp',...(type==='authorization_code'?{code:value,redirect_uri:callback,code_verifier:verifier}:{refresh_token:value})}).toString()});

for(const scenario of ['pending-consent','authorization-code','refresh-token'])test('abrupt workerd termination after durable '+scenario+' consumption refuses replay',{timeout:60000},async t=>{
 const persist=await mkdtemp(path.join(base,'.crash-recovery-'));let runtime;
 t.after(async()=>{if(runtime)await terminate(runtime.child);assert.ok(path.resolve(persist).startsWith(path.resolve(base)+path.sep));await rm(persist,{recursive:true,force:true,maxRetries:20,retryDelay:100});});
 runtime=await start(persist);
 const consent=await authorize(runtime);let replay=consent;
 if(scenario!=='pending-consent') {
  const result=await runtime.request(consent.path,consent.init);assert.equal(result.status,200);
  const code=new URL(JSON.parse(result.body).redirect_to).searchParams.get('code');
  replay={path:'/token',init:tokenRequest('authorization_code',code)};
  if(scenario==='refresh-token') {
   const issued=await runtime.request(replay.path,replay.init);assert.equal(issued.status,200);
   replay={path:'/token',init:tokenRequest('refresh_token',JSON.parse(issued.body).refresh_token)};
  }
 }
 const arm={operation:scenario==='pending-consent'?'delete':'put',prefix:scenario==='pending-consent'?'pending:':scenario==='authorization-code'?'spent-code:':'spent-refresh:'};
 assert.equal((await runtime.request('/fixture/arm',{method:'POST',body:JSON.stringify(arm)})).status,200);
 const reached=runtime.checkpoint();void runtime.request(replay.path,replay.init);
 await reached;await terminate(runtime.child);
 runtime=await start(persist);
 const refused=await runtime.request(replay.path,replay.init);
 assert.equal(refused.status,scenario==='pending-consent'?410:400);
 assert.equal(runtime.checks,0,'consumed replay must stop before backend authority checks');
 const catalog=await runtime.request('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
 assert.equal(catalog.status,200);assert.equal(JSON.parse(catalog.body).result.tools.length,17);
});
