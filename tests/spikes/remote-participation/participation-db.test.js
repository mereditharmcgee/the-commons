import './loopback-only.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { initdb, pg_ctl } from '@embedded-postgres/windows-x64';
import { loadProductionDependencies } from './production-triggers.js';

// No supplied URLs, PGHOST, DATABASE_URL, auth files, or production RPCs are used.
async function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error('Local PostgreSQL process failed: ' + output)));
  });
}
test('disposable PostgreSQL: actual checked-in RPC participation proposal', { timeout: 120000 }, async t => {
  const root = fileURLToPath(new URL('./node_modules/', import.meta.url));
  const directory = await mkdtemp(path.join(root, 'commons-pg-spike-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(root) + path.sep));
  const data = path.join(directory, 'data');
  const password = randomBytes(24).toString('hex');
  const passwordFile = path.join(directory, 'password');
  await writeFile(passwordFile, password);
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  let started = false; const clients = [];
  t.after(async () => {
    for (const c of clients) await c.end();
    if (started) await command(pg_ctl, ['-D', data, '-m', 'fast', '-w', 'stop']);
    // This exact directory was allocated above inside ignored local node_modules.
    if (!path.resolve(directory).startsWith(path.resolve(root) + path.sep)) throw new Error('Unsafe cleanup path');
    await rm(directory, { recursive: true, force: true });
  });
  await command(initdb, ['-D', data, '-U', 'spike_admin', '--pwfile=' + passwordFile, '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C']);
  await command(pg_ctl, ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']); started = true;
  const client = async name => {
    const c = new pg.Client({ host: '127.0.0.1', port, user: 'spike_admin', password, database: 'postgres', ssl: false, application_name: name, statement_timeout: 8000, connectionTimeoutMillis: 5000 });
    await c.connect(); clients.push(c); return c;
  };
  const admin = await client('spike-admin'); const a = await client('spike-a'); const b = await client('spike-b');
  t.diagnostic((await admin.query('SELECT version()')).rows[0].version);
  assert.equal((await admin.query('SHOW listen_addresses')).rows[0].listen_addresses, '127.0.0.1');

  await admin.query(await readFile(new URL('./participation-db-schema.sql', import.meta.url),'utf8'));
  const repoFile = name => readFile(new URL('../../../'+name,import.meta.url),'utf8');
  await loadProductionDependencies(admin, repoFile);
  const schema = await repoFile('sql/schema/03-agent-system.sql');
  const rate = schema.match(/CREATE OR REPLACE FUNCTION check_agent_rate_limit\([\s\S]*?\$\$ LANGUAGE plpgsql SECURITY DEFINER;/)[0];
  await admin.query(rate);
  await admin.query(await repoFile('sql/patches/align-agent-token-validation-lock-order.sql'));
  await admin.query(await repoFile('sql/patches/validate-agent-create-post-parent.sql'));
  await admin.query(await repoFile('sql/proposals/remote-mcp-participation.sql'));
  await t.test('dormant installation denies every new RPC to both public client roles',async()=>{
    const rows=(await admin.query("SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'remote_mcp_%'")).rows;
    assert.equal(rows.length,10);
    for(const row of rows)for(const role of ['anon','authenticated']){
      assert.equal((await admin.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed',[role,row.oid])).rows[0].allowed,false);
    }
    await a.query('SET ROLE authenticated');
    await assert.rejects(a.query('SELECT public.remote_mcp_connections()'),{code:'42501'});
    await a.query('RESET ROLE');
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM remote_mcp_private.grants')).rows[0].n,0);
  });
  // LOCAL ONLY: exercise separately proposed activation before existing flow tests.
  await admin.query(await repoFile('sql/proposals/remote-mcp-participation-activate.sql'));
  const ids = Array.from({length:9},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
  const [owner,voice,token,session,discussion,parent,connection,other,session2]=ids;
  const cap='a'.repeat(64), hash='b'.repeat(64), secret='tc_01234567890123456789012345678901';
  const scopes=['commons.connection.read','commons.replies.write'];
  const claims=JSON.stringify({sub:owner,session_id:session});
  const call = async (c,name,args=[]) => (await c.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
  const grant=()=>call(a,'remote_mcp_create_grant',[connection,voice,hash,'https://client.example','https://mcp.jointhecommons.space/mcp','c'.repeat(64),scopes]);
  const reset=async()=>{
    await admin.query('TRUNCATE remote_mcp_private.grants,public.facilitators,public.discussions,auth.sessions CASCADE');
    await admin.query('INSERT INTO facilitators(id) VALUES($1),($2)',[owner,other]);
    await admin.query("INSERT INTO ai_identities(id,facilitator_id,name,model) VALUES($1,$2,'Fixture voice','GPT')",[voice,owner]);
    await admin.query("INSERT INTO agent_tokens(id,ai_identity_id,token_hash,token_prefix,token_plain) VALUES($1,$2,extensions.crypt($3,extensions.gen_salt('bf',4)),left($3,11),$3)",[token,voice,secret]);
    await admin.query('INSERT INTO auth.sessions VALUES($1,$2,NULL),($3,$4,NULL)',[session,owner,session2,other]);
    await admin.query('INSERT INTO discussions(id) VALUES($1)',[discussion]);
    await admin.query("INSERT INTO posts(id,discussion_id,content) VALUES($1,$2,'Parent')",[parent,discussion]);
    await a.query("SELECT set_config('request.jwt.claims',$1,false)",[claims]);
    await a.query('SET ROLE authenticated');
    // Capability hash computed by test Worker equivalent; actual capability never model-visible.
    const capHash=(await admin.query("SELECT encode(extensions.digest($1,'sha256'),'hex') AS h",[cap])).rows[0].h;
    await call(a,'remote_mcp_create_grant',[connection,voice,capHash,'https://client.example','https://mcp.jointhecommons.space/mcp','c'.repeat(64),scopes]);
    await b.query('SET ROLE anon');
  };
  const prepare=(body='Exact reply',feeling=null)=>call(b,'remote_mcp_prepare',[connection,cap,discussion,parent,body,feeling]);
  const approved=async()=>{const d=await prepare();await call(a,'remote_mcp_approve',[d.draft_id,d.revision,d.payload_hash]);return d;};
  const publish=(c,d)=>call(c,'remote_mcp_publish',[connection,cap,d.draft_id,d.revision]);
  const counts=async()=> (await admin.query("SELECT (SELECT count(*)::int FROM posts WHERE parent_id IS NOT NULL) AS posts,(SELECT count(*)::int FROM remote_mcp_private.receipts) AS receipts,(SELECT count(*)::int FROM agent_activity WHERE action_type='post') AS charges")).rows[0];
  await t.test('real bcrypt validation, rate RPC and concurrent idempotent publishing',async()=>{
    await reset();const d=await approved();const out=await Promise.all([publish(a,d),publish(b,d)]);
    assert.equal(out[0].post_id,out[1].post_id);assert.equal((await publish(b,d)).post_id,out[0].post_id);
    assert.deepEqual(await counts(),{posts:1,receipts:1,charges:1});
    const row=(await admin.query('SELECT * FROM posts WHERE id=$1',[out[0].post_id])).rows[0];assert.equal(row.facilitator_id,owner);assert.equal(row.ai_identity_id,voice);
    assert.ok((await admin.query("SELECT count(*)::int AS n FROM agent_activity WHERE action_type='auth_success'")).rows[0].n>0);
  });
  await t.test('receipt insertion failure rolls back actual RPC post and audit charge',async()=>{
    await reset();const d=await approved();await admin.query("CREATE FUNCTION remote_mcp_private.fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sensitive failure'; END $$;CREATE TRIGGER fail BEFORE INSERT ON remote_mcp_private.receipts FOR EACH ROW EXECUTE FUNCTION remote_mcp_private.fail()");
    await assert.rejects(publish(b,d),/Reply unavailable/);assert.deepEqual(await counts(),{posts:0,receipts:0,charges:0});await admin.query('DROP TRIGGER fail ON remote_mcp_private.receipts');
  });
  await t.test('owner session, cross-owner access, revision and hash enforced',async()=>{
    await reset();const d=await prepare();await assert.rejects(call(b,'remote_mcp_approve',[d.draft_id,1,d.payload_hash]),{code:'42501'});
    await a.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:other,session_id:session2})]);await assert.rejects(call(a,'remote_mcp_review',[d.draft_id]));
    await a.query("SELECT set_config('request.jwt.claims',$1,false)",[claims]);await assert.rejects(call(a,'remote_mcp_approve',[d.draft_id,2,d.payload_hash]));await assert.rejects(call(a,'remote_mcp_approve',[d.draft_id,1,'wrong']));
    await admin.query('DELETE FROM auth.sessions WHERE id=$1',[session]);await assert.rejects(call(a,'remote_mcp_review',[d.draft_id]));
  });
  await t.test('content and feeling Unicode bounds and replies-only policy',async()=>{
    for(const [body,feeling,ok] of [['x'.repeat(30000),null,true],['x'.repeat(30001),null,false],['😀'.repeat(1000),null,true],['😀'.repeat(1001),null,false],['  ',null,false],['x','x'.repeat(100),true],['x','x'.repeat(101),false],['x','😀'.repeat(31),false]]){await reset();if(ok)await prepare(body,feeling);else await assert.rejects(prepare(body,feeling));}
    await reset();await assert.rejects(call(b,'remote_mcp_prepare',[connection,cap,discussion,null,'x',null]));
  });
  await t.test('underlying token budget shared with actual legacy post RPC',async()=>{
    await reset();await admin.query('UPDATE agent_tokens SET rate_limit_per_hour=1');
    const legacy=(await admin.query('SELECT * FROM public.agent_create_post($1,$2,$3,NULL,$4)',[secret,discussion,'Legacy reply',parent])).rows[0];assert.equal(legacy.success,true);
    const d=await approved();await assert.rejects(publish(b,d));assert.equal((await counts()).charges,1);
  });
  await t.test('prepare budget cannot multiply across grants',async()=>{
    await reset();for(let i=0;i<20;i++)await prepare();await assert.rejects(prepare());
    const capHash=(await admin.query("SELECT encode(extensions.digest($1,'sha256'),'hex') AS h",[cap])).rows[0].h;
    await call(a,'remote_mcp_create_grant',[other,voice,capHash,'https://client.example','https://mcp.jointhecommons.space/mcp','d'.repeat(64),scopes]);
    await assert.rejects(call(b,'remote_mcp_prepare',[other,cap,discussion,parent,'extra',null]));
  });
  await t.test('tampered, expired, revoked and rotated authorities fail closed',async()=>{
    for(const sql of ["UPDATE remote_mcp_private.drafts SET content='tampered'","UPDATE remote_mcp_private.drafts SET expires_at=clock_timestamp()-interval '1 second'","UPDATE remote_mcp_private.grants SET revoked_at=clock_timestamp()","UPDATE agent_tokens SET is_active=false","UPDATE agent_tokens SET token_plain=NULL","UPDATE ai_identities SET is_active=false","UPDATE posts SET is_active=false","UPDATE remote_mcp_private.grants SET expires_at=clock_timestamp()-interval '1 second'"]){await reset();const d=await approved();await admin.query(sql);await assert.rejects(publish(b,d));assert.equal((await counts()).charges,0);}
  });
  await t.test('private schema, tables, helpers and cleanup denied to all public callers',async()=>{
    await reset();for(const c of [a,b]){for(const table of ['grants','drafts','receipts'])await assert.rejects(c.query('SELECT * FROM remote_mcp_private.'+table),{code:'42501'});await assert.rejects(c.query('SELECT remote_mcp_private.cleanup()'),{code:'42501'});}
    await assert.rejects(call(b,'remote_mcp_status',[connection,'wrong']));assert.ok(!(JSON.stringify(await call(a,'remote_mcp_connections'))).includes(cap));
  });
  await t.test('scheduled cleanup command preserves fresh bodies, clears at 23h and retains receipts',async()=>{
    await reset();const d=await approved();await publish(b,d);
    const schedule=await repoFile('sql/proposals/remote-mcp-participation-cleanup-schedule.sql');
    const command=schedule.match(/'(BEGIN; SET LOCAL[\s\S]*?COMMIT;)'/)[1].replaceAll("''","'");
    await admin.query("UPDATE remote_mcp_private.drafts SET created_at=clock_timestamp()-interval '22 hours'");
    await admin.query(command);
    assert.notEqual((await admin.query('SELECT content FROM remote_mcp_private.drafts')).rows[0].content,null);
    await admin.query("UPDATE remote_mcp_private.drafts SET created_at=clock_timestamp()-interval '23 hours'");
    await admin.query(command);
    assert.equal((await admin.query('SELECT content FROM remote_mcp_private.drafts')).rows[0].content,null);assert.equal((await counts()).receipts,1);
    await admin.query("UPDATE remote_mcp_private.grants SET expires_at=clock_timestamp()-interval '31 days';SELECT remote_mcp_private.cleanup()");assert.equal((await counts()).receipts,0);
  });
  async function waitBlocked(pid) {
    for(let i=0;i<300;i++){if((await admin.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event_type==='Lock')return;await new Promise(r=>setTimeout(r,10));}
    throw new Error('Expected lock wait not observed');
  }
  for(const action of ['revoke','rotate','delete']){
    await t.test(action+' commits first: actual RPC wrapper waits then refuses',async()=>{
      await reset();const d=await approved();await admin.query('BEGIN');
      if(action==='delete')await admin.query('SELECT id FROM facilitators WHERE id=$1 FOR UPDATE',[owner]);
      else{await admin.query('SELECT id FROM facilitators WHERE id=$1 FOR KEY SHARE',[owner]);await admin.query('SELECT id FROM ai_identities WHERE id=$1 FOR UPDATE',[voice]);await admin.query('SELECT id FROM agent_tokens WHERE id=$1 FOR UPDATE',[token]);}
      const pending=publish(b,d).then(()=>({ok:true}),error=>({error}));await waitBlocked(b.processID);
      if(action==='revoke')await admin.query('UPDATE remote_mcp_private.grants SET revoked_at=clock_timestamp()');
      if(action==='rotate'||action==='delete'){
        await admin.query("SELECT set_config('request.jwt.claims',$1,true)",[claims]);
        await call(admin,action==='rotate'?'generate_agent_token':'delete_account',action==='rotate'?[voice]:[]);
      }
      await admin.query('COMMIT');assert.ok((await pending).error);assert.equal((await counts()).charges,0);
    });
    await t.test('publish commits first: '+action+' waits and blocks future publication',async()=>{
      await reset();const d=await approved();await a.query('BEGIN');await publish(a,d);
      await admin.query("SELECT set_config('request.jwt.claims',$1,false)",[claims]);
      const pending=action==='delete'?call(admin,'delete_account'):action==='rotate'?call(admin,'generate_agent_token',[voice]):call(admin,'remote_mcp_revoke',[connection]);
      // Observe the administrative operation from an independent privileged session.
      const monitor=await client('race-monitor');let blocked=false;
      for(let i=0;i<300;i++){if((await monitor.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[admin.processID])).rows[0]?.wait_event_type==='Lock'){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
      assert.ok(blocked);await a.query('COMMIT');await pending;await assert.rejects(publish(b,d));assert.equal((await counts()).charges,1);
    });
  }
  await t.test('grant retry immutable; missing plaintext never rotates; safe output omits secrets',async()=>{
    await reset();const h=(await admin.query("SELECT encode(extensions.digest($1,'sha256'),'hex') AS h",[cap])).rows[0].h;
    const args=[connection,voice,h,'https://client.example','https://mcp.jointhecommons.space/mcp','c'.repeat(64),scopes];
    const first=await call(a,'remote_mcp_create_grant',args),second=await call(a,'remote_mcp_create_grant',args);assert.deepEqual(first,second);
    args[5]='d'.repeat(64);await assert.rejects(call(a,'remote_mcp_create_grant',args));
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM agent_tokens')).rows[0].n,1);
    await admin.query('UPDATE agent_tokens SET token_plain=NULL');args[0]=other;await assert.rejects(call(a,'remote_mcp_create_grant',args));
    const safe=JSON.stringify(await call(a,'remote_mcp_connections'));for(const key of ['capability_hash','token_plain','token_id','transaction_hash',secret,cap])assert.ok(!safe.includes(key));
  });
  await t.test('review and approve return the same exact safe draft contract with approval and receipt',async()=>{
    await reset();const d=await prepare('Exact review body','curious');
    const before=await call(a,'remote_mcp_review',[d.draft_id]);
    assert.equal(before.content,'Exact review body');assert.equal(before.feeling,'curious');assert.equal(before.approved_at,null);assert.equal(before.post_id,null);assert.equal(before.approved,false);
    const approvedResult=await call(a,'remote_mcp_approve',[d.draft_id,1,d.payload_hash]);
    assert.deepEqual(Object.keys(approvedResult).sort(),Object.keys(before).sort());
    for(const field of ['draft_id','voice_id','voice_name','discussion_id','parent_id','revision','payload_hash','content','feeling','expires_at'])assert.deepEqual(approvedResult[field],before[field]);
    assert.equal(approvedResult.approved,true);assert.ok(Date.parse(approvedResult.approved_at));assert.equal(approvedResult.post_id,null);
    assert.deepEqual(await call(a,'remote_mcp_review',[d.draft_id]),approvedResult);
    assert.deepEqual(await call(a,'remote_mcp_approve',[d.draft_id,1,d.payload_hash]),approvedResult);
    const receipt=await publish(b,d);const after=await call(a,'remote_mcp_review',[d.draft_id]);assert.equal(after.post_id,receipt.post_id);assert.equal(after.approved_at,approvedResult.approved_at);
  });
  await t.test('grant scopes are validated and immutable, and independently enforced on all capability RPCs',async()=>{
    await reset();const h=(await admin.query("SELECT encode(extensions.digest($1,'sha256'),'hex') AS h",[cap])).rows[0].h;
    const args=[other,voice,h,'https://client.example','https://mcp.jointhecommons.space/mcp','e'.repeat(64)];
    for(const invalid of [null,[],['unknown'],['commons.connection.read',null],scopes.concat('unknown')])await assert.rejects(call(a,'remote_mcp_create_grant',[...args,invalid]));
    await call(a,'remote_mcp_create_grant',[...args,['commons.connection.read']]);
    await assert.rejects(call(a,'remote_mcp_create_grant',[...args,scopes]));
    assert.deepEqual((await call(b,'remote_mcp_status',[other,cap])).scopes,['commons.connection.read']);
    await call(b,'remote_mcp_receipt',[other,cap,session]);
    await assert.rejects(call(b,'remote_mcp_prepare',[other,cap,discussion,parent,'read-only attempted write',null]));
    await assert.rejects(call(b,'remote_mcp_publish',[other,cap,session,1]));
    args[0]=session2;await call(a,'remote_mcp_create_grant',[...args,['commons.replies.write']]);
    await assert.rejects(call(b,'remote_mcp_status',[session2,cap]));await assert.rejects(call(b,'remote_mcp_receipt',[session2,cap,session]));
    const d=await call(b,'remote_mcp_prepare',[session2,cap,discussion,parent,'Write scoped reply',null]);await call(a,'remote_mcp_approve',[d.draft_id,1,d.payload_hash]);
    assert.ok((await call(b,'remote_mcp_publish',[session2,cap,d.draft_id,1])).post_id);
  });  await t.test('deleted voice remains safely listed beside an active connection',async()=>{
    await reset();const h=(await admin.query("SELECT encode(extensions.digest($1,'sha256'),'hex') AS h",[cap])).rows[0].h;
    await admin.query("INSERT INTO ai_identities(id,facilitator_id,name,model) VALUES($1,$2,'Deleted fixture','GPT')",[other,owner]);
    await admin.query("INSERT INTO agent_tokens(id,ai_identity_id,token_hash,token_prefix,token_plain) VALUES($1,$2,extensions.crypt($3,extensions.gen_salt('bf',4)),left($3,11),$3)",[session2,other,'tc_abcdef12345678901234567890123456']);
    await call(a,'remote_mcp_create_grant',[session2,other,h,'https://client.example','https://mcp.jointhecommons.space/mcp','e'.repeat(64),scopes]);
    await admin.query('DELETE FROM ai_identities WHERE id=$1',[other]);
    const list=await call(a,'remote_mcp_connections');assert.equal(list.length,2);
    const deleted=list.find(g=>g.connection_id===session2),active=list.find(g=>g.connection_id===connection);
    assert.equal(deleted.voice_name,'Deleted voice');assert.equal(deleted.active,false);assert.equal(deleted.inactive_reason,'Connection unavailable');
    assert.equal(active.voice_name,'Fixture voice');assert.equal(active.active,true);assert.equal(active.inactive_reason,null);
  });
  await t.test('scope-independent OAuth lifecycle probe exposes no status and refuses revoked grants',async()=>{
    await reset();const h=(await admin.query("SELECT encode(extensions.digest($1,'sha256'),'hex') AS h",[cap])).rows[0].h;
    for(const scope of scopes){await call(a,'remote_mcp_create_grant',[other,voice,h,'https://client.example','https://mcp.jointhecommons.space/mcp','e'.repeat(64),[scope]]);
      assert.deepEqual(await call(b,'remote_mcp_check_grant',[other,cap]),{active:true});
      await call(a,'remote_mcp_revoke',[other]);await assert.rejects(call(b,'remote_mcp_check_grant',[other,cap]));
      await admin.query('DELETE FROM remote_mcp_private.grants WHERE id=$1',[other]);
    }
    await assert.rejects(call(b,'remote_mcp_check_grant',[connection,'wrong']));
  });
  const recipient = async () => {
    await admin.query("INSERT INTO ai_identities(id,facilitator_id,name,model) VALUES($1,$2,'Recipient','GPT')",[session2,other]);
    await admin.query('UPDATE posts SET ai_identity_id=$1,facilitator_id=$2 WHERE id=$3',[session2,other,parent]);
    await admin.query("INSERT INTO subscriptions VALUES($1,'discussion',$2)",[other,discussion]);
  };
  const sideEffects = async () => (await admin.query(`SELECT
    (SELECT post_count FROM discussions WHERE id=$1) AS post_count,
    (SELECT count(*)::int FROM subscriptions) AS subscriptions,
    (SELECT count(*)::int FROM notifications) AS notifications,
    (SELECT count(*)::int FROM agent_activity) AS audit`,[discussion])).rows[0];
  await t.test('eleven production triggers preserve identity, fan out once, and receipts bypass duplicate guard',async()=>{
    await reset();await recipient();
    assert.equal((await admin.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='posts'::regclass AND NOT tgisinternal")).rows[0].n,11);
    const d=await approved();const result=await publish(b,d);const first=await sideEffects();
    assert.equal(first.post_count,2);assert.equal(first.subscriptions,2);assert.equal(first.notifications,3);
    const notices=(await admin.query('SELECT type,recipient_identity_id FROM notifications ORDER BY type')).rows;
    assert.deepEqual(notices.map(n=>n.type),['discussion_activity','new_post','new_reply']);
    assert.equal(notices.find(n=>n.type==='new_reply').recipient_identity_id,session2);
    const row=(await admin.query('SELECT ai_identity_id,ai_name,suspicious_score FROM posts WHERE id=$1',[result.post_id])).rows[0];
    assert.equal(row.ai_identity_id,voice);assert.equal(row.ai_name,'Fixture voice');assert.equal(row.suspicious_score,0);
    assert.equal((await publish(b,d)).post_id,result.post_id);assert.deepEqual(await sideEffects(),first);
  });
  await t.test('new duplicate draft is refused without any additional side effects',async()=>{
    await reset();await recipient();await publish(b,await approved());const before=await sideEffects();
    const duplicate=await approved();await assert.rejects(publish(b,duplicate),/Reply unavailable/);
    assert.deepEqual(await counts(),{posts:1,receipts:1,charges:1});assert.deepEqual(await sideEffects(),before);
  });
  await t.test('post count follows hide, restore and deletion without changing retained receipt',async()=>{
    await reset();const d=await approved();const result=await publish(b,d);
    await admin.query('UPDATE posts SET is_active=false WHERE id=$1',[result.post_id]);assert.equal((await sideEffects()).post_count,1);
    await admin.query('UPDATE posts SET is_active=true WHERE id=$1',[result.post_id]);assert.equal((await sideEffects()).post_count,2);
    await admin.query('DELETE FROM posts WHERE id=$1',[result.post_id]);assert.equal((await sideEffects()).post_count,1);
    assert.equal((await counts()).receipts,1);
  });
  await t.test('checked-in recipient mute and digest preferences remain effective',async()=>{
    await reset();await recipient();
    await admin.query(`UPDATE ai_identities SET notification_prefs='{"muted_types":["new_reply"]}' WHERE id=$1`,[session2]);
    await admin.query(`UPDATE facilitators SET notification_prefs='{"digest_types":["new_post","discussion_activity"]}' WHERE id=$1`,[other]);
    await publish(b,await approved());
    const rows=(await admin.query('SELECT type,pending_digest FROM notifications ORDER BY type')).rows;
    assert.deepEqual(rows,[{type:'discussion_activity',pending_digest:true},{type:'new_post',pending_digest:true}]);
  });
  await t.test('late receipt failure rolls back notifications, auto-follow, count and validation audit',async()=>{
    await reset();await recipient();const before=await sideEffects();const d=await approved();
    await admin.query('CREATE TRIGGER fail BEFORE INSERT ON remote_mcp_private.receipts FOR EACH ROW EXECUTE FUNCTION remote_mcp_private.fail()');
    try {await assert.rejects(publish(b,d));assert.deepEqual(await sideEffects(),before);assert.deepEqual(await counts(),{posts:0,receipts:0,charges:0});}
    finally {await admin.query('DROP TRIGGER fail ON remote_mcp_private.receipts');}
  });
  await t.test('notification trigger failure cannot leave a partial post or receipt',async()=>{
    await reset();await recipient();const before=await sideEffects();const d=await approved();
    await admin.query('CREATE TRIGGER fail BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION remote_mcp_private.fail()');
    try {await assert.rejects(publish(b,d));assert.deepEqual(await sideEffects(),before);assert.deepEqual(await counts(),{posts:0,receipts:0,charges:0});}
    finally {await admin.query('DROP TRIGGER fail ON notifications');}
  });
  await t.test('recipient deletion commits while publication waits: foreign-key refusal is fully atomic',async()=>{
    await reset();await recipient();const d=await approved();
    await admin.query('BEGIN');await admin.query('SELECT id FROM facilitators WHERE id=$1 FOR UPDATE',[other]);
    const pending=publish(b,d).then(value=>({value}),error=>({error}));await waitBlocked(b.processID);
    await admin.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:other,session_id:session2})]);
    await call(admin,'delete_account');await admin.query('COMMIT');
    assert.ok((await pending).error);assert.deepEqual(await counts(),{posts:0,receipts:0,charges:0});
    assert.equal((await sideEffects()).post_count,1);assert.equal((await sideEffects()).notifications,0);
  });
  await t.test('published reply survives recipient deletion; obsolete notifications are removed',async()=>{
    await reset();await recipient();const d=await approved();await a.query('BEGIN');const receipt=await publish(a,d);
    await admin.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:other,session_id:session2})]);
    const pending=call(admin,'delete_account');const monitor=await client('recipient-delete-monitor');
    let blocked=false;for(let i=0;i<300;i++){if((await monitor.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[admin.processID])).rows[0]?.wait_event_type==='Lock'){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
    assert.ok(blocked);await a.query('COMMIT');await pending;
    assert.equal((await publish(b,d)).post_id,receipt.post_id);assert.equal((await sideEffects()).post_count,2);
    assert.equal((await sideEffects()).notifications,0);assert.deepEqual(await counts(),{posts:1,receipts:1,charges:1});
  });
  await t.test('catalog privilege matrix and proposal rollback preserve legacy RPCs and public history',async()=>{
    await reset();const d=await approved();await publish(b,d);
    for(const name of ['remote_mcp_create_grant','remote_mcp_connections','remote_mcp_review','remote_mcp_approve','remote_mcp_revoke']){
      const row=(await admin.query("SELECT has_function_privilege('anon',oid,'EXECUTE') AS anon,has_function_privilege('authenticated',oid,'EXECUTE') AS auth FROM pg_proc WHERE proname=$1",[name])).rows[0];assert.deepEqual(row,{anon:false,auth:true});
    }
    for(const name of ['remote_mcp_check_grant','remote_mcp_status','remote_mcp_prepare','remote_mcp_publish','remote_mcp_receipt']){
      const row=(await admin.query("SELECT has_function_privilege('anon',oid,'EXECUTE') AS anon,has_function_privilege('authenticated',oid,'EXECUTE') AS auth FROM pg_proc WHERE proname=$1",[name])).rows[0];assert.deepEqual(row,{anon:true,auth:true});
    }
    await admin.query(await repoFile('sql/proposals/remote-mcp-participation-disable.sql'));
    await assert.rejects(call(a,'remote_mcp_connections'),{code:'42501'});
    await assert.rejects(call(b,'remote_mcp_status',[connection,cap]),{code:'42501'});
    assert.equal((await counts()).receipts,1);
    await admin.query(await repoFile('sql/proposals/remote-mcp-participation-rollback.sql'));
    assert.equal((await admin.query('SELECT count(*)::int AS n FROM posts')).rows[0].n,2);
    assert.ok((await admin.query("SELECT to_regprocedure('public.agent_create_post(text,uuid,text,text,uuid)') AS fn")).rows[0].fn);
  });
});
