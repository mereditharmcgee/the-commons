// Offline child process only; never deploy this entry or its checkpoint endpoints.
import './loopback-only.js';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';

const owner='11111111-1111-4111-8111-111111111111';
const voice='33333333-3333-4333-8333-333333333333';
const client='https://chatgpt.com/oauth/client.json';
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const output=await build({stdin:{contents:`
 import worker from '../../../mcp-server-the-commons/hosted/index.js';
 import {RemoteOAuthBroker as ProductionBroker} from '../../../mcp-server-the-commons/hosted/oauth-broker.js';
 class CrashBroker extends ProductionBroker {
  constructor(ctx,env) {
   super(ctx,env);
   for(const operation of ['put','delete']) {
    const original=this.store[operation].bind(this.store);
    this.store[operation]=async (...args)=>{
     const result=await original(...args);
     if(this.arm && this.arm.operation===operation && args[0].startsWith(this.arm.prefix)) {
      this.arm=null;
      await ctx.storage.sync();
      await fetch('https://checkpoint.invalid/reached');
      await new Promise(()=>{});
     }
     return result;
    };
   }
  }
  async fetch(request) {
   if(new URL(request.url).pathname==='/fixture/arm') {
    this.arm=await request.json(); return Response.json({armed:true});
   }
   return super.fetch(request);
  }
 }
 export {CrashBroker as RemoteOAuthBroker};
 export default {fetch(request,env,ctx){
  if(new URL(request.url).pathname==='/fixture/arm') return env.OAUTH_BROKER.get(env.OAUTH_BROKER.idFromName('pilot')).fetch(request);
  return worker.fetch(request,env,ctx);
 }};
`,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'crash-fixture.js'},bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],external:['cloudflare:workers']});
const mf=new Miniflare(convertV4MiniflareOptions({name:'crash-fixture',modules:true,script:output.outputFiles[0].text,compatibilityDate:'2026-09-07',compatibilityFlags:['global_fetch_strictly_public'],cf:false,host:'127.0.0.1',resourcePersistencePath:process.argv[2],durableObjects:{OAUTH_BROKER:{className:'RemoteOAuthBroker',useSQLite:true}},bindings:{PARTICIPATION_ENABLED:'true',PILOT_OWNER_IDS:JSON.stringify([owner]),OAUTH_CLIENT_IDS:JSON.stringify([client]),SUPABASE_ANON_KEY:'header.'+Buffer.from('{"role":"anon"}').toString('base64url')+'.fixture'},outboundService:async request=>{
 const url=new URL(request.url);
 if(url.origin==='https://checkpoint.invalid') {process.send({checkpoint:true});return new Response('checkpoint');}
 if(url.href===client) return Response.json({client_id:client,client_name:"Synthetic ChatGPT",redirect_uris:[callback],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
 if(url.origin!=='https://dfephsfberzadihcrhal.supabase.co') throw new Error('Unexpected outbound request blocked');
 if(url.pathname==='/auth/v1/user') return Response.json({id:owner});
 if(url.pathname==='/rest/v1/ai_identities') return Response.json([{id:voice,name:'Synthetic voice',model:'GPT'}]);
 if(url.pathname==='/rest/v1/rpc/remote_mcp_create_grant') {const a=await request.json();return Response.json({connection_id:a.p_connection_id,voice_id:voice,expires_at:new Date(Date.now()+604800000).toISOString()});}
 if(url.pathname==='/rest/v1/rpc/remote_mcp_check_grant') {process.send({backendCheck:true});return Response.json({active:true});}
 throw new Error('Unexpected backend operation blocked');
}}));
process.on('message',async ({id,path,init})=>{
 try {const r=await mf.dispatchFetch('https://mcp.jointhecommons.space'+path,init);process.send({id,status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});}
 catch {process.send({id,error:'Offline request interrupted'});}
});
await mf.ready;
process.send({ready:true});
