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
test('disposable PostgreSQL: atomic authority and receipt transactions', { timeout: 60000 }, async t => {
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
  await admin.query(await readFile(new URL('./authority-fixture.sql', import.meta.url), 'utf8'));
  const reset = async () => admin.query(`
    TRUNCATE fixture.handoffs,fixture.receipts,fixture.posts,fixture.drafts,fixture.grants,fixture.tokens,fixture.identities,fixture.facilitators,fixture.parents CASCADE;
    INSERT INTO fixture.facilitators VALUES('owner'); INSERT INTO fixture.identities(id,owner_id) VALUES('voice','owner');
    INSERT INTO fixture.tokens(id,voice_id,secret) VALUES('token','voice','synthetic-tc-secret');
    INSERT INTO fixture.grants(id,owner_id,voice_id,token_id,capability_hash) VALUES('grant','owner','voice','token',digest('synthetic-capability','sha256'));
    INSERT INTO fixture.parents(id,discussion_id) VALUES('parent','discussion');
    INSERT INTO fixture.drafts(id,grant_id,revision,content,parent_id,discussion_id) VALUES('draft','grant',1,'Exact approved reply','parent','discussion');
    UPDATE fixture.drafts d SET approved_hash=fixture.payload_hash(d);
  `);
  const publish = c => c.query("SELECT fixture.publish('synthetic-capability','grant','draft',1) AS id");
  const counts = async () => (await admin.query('SELECT (SELECT count(*)::int FROM fixture.posts) AS posts,(SELECT count(*)::int FROM fixture.receipts) AS receipts,(SELECT uses FROM fixture.tokens LIMIT 1) AS uses')).rows[0];
  await t.test('concurrent publication and retry after lost response return one receipt and charge', async () => {
    await reset();
    const results = await Promise.all([publish(a), publish(b)]);
    assert.equal(results[0].rows[0].id, results[1].rows[0].id);
    // Discarded response is a transport timeout after commit, not a fresh draft.
    assert.equal((await publish(a)).rows[0].id, results[0].rows[0].id);
    assert.deepEqual(await counts(), { posts: 1, receipts: 1, uses: 1 });
  });
  await t.test('receipt failure rolls back post and token allowance', async () => {
    await reset();
    await admin.query("CREATE FUNCTION fixture.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected receipt storage failure'; END $$; CREATE TRIGGER fail_receipt BEFORE INSERT ON fixture.receipts FOR EACH ROW EXECUTE FUNCTION fixture.fail_receipt()");
    await assert.rejects(publish(a), /injected receipt storage failure/);
    assert.deepEqual(await counts(), { posts: 0, receipts: 0, uses: 0 });
    await admin.query('DROP TRIGGER fail_receipt ON fixture.receipts');
    await publish(b); assert.deepEqual(await counts(), { posts: 1, receipts: 1, uses: 1 });
  });
  await t.test('changed content, expiry, missing approval, wrong parent, capability and rate fail closed', async () => {
    for (const sql of ["UPDATE fixture.drafts SET content='changed'", "UPDATE fixture.drafts SET expires=now()-interval '1 second'", 'UPDATE fixture.drafts SET approved_hash=NULL', "UPDATE fixture.parents SET discussion_id='other'", 'UPDATE fixture.tokens SET uses=60', 'UPDATE fixture.tokens SET active=false', 'UPDATE fixture.grants SET revoked=true', "UPDATE fixture.grants SET expires=now()-interval '1 second'"]) {
      await reset(); await admin.query(sql); await assert.rejects(publish(a));
      assert.equal((await counts()).posts, 0);
    }
    await reset(); await assert.rejects(a.query("SELECT fixture.publish('wrong','grant','draft',1)"));
  });
  await t.test('PostgreSQL Unicode counting and approved payload bounds', async () => {
    for (const [body, allowed] of [['x'.repeat(30000), true], ['x'.repeat(30001), false], ['😀'.repeat(1000), true], ['😀'.repeat(1001), false], ['   ', false]]) {
      await reset(); await admin.query('UPDATE fixture.drafts SET content=$1', [body]);
      await admin.query('UPDATE fixture.drafts d SET approved_hash=fixture.payload_hash(d)');
      if (allowed) await publish(a); else await assert.rejects(publish(a));
      assert.equal((await counts()).posts, allowed ? 1 : 0);
    }
  });
  await t.test('cross-grant draft, changed revision and inactive or missing identity rejected', async () => {
    for (const sql of ["UPDATE fixture.drafts SET grant_id='other-grant'", 'UPDATE fixture.drafts SET revision=2', 'UPDATE fixture.identities SET active=false', "DELETE FROM fixture.identities WHERE id='voice'", "UPDATE fixture.tokens SET expires=now()-interval '1 second'"]) {
      await reset(); await admin.query(sql); await assert.rejects(publish(a)); assert.equal((await counts()).posts,0);
    }
  });
  async function waitBlocked(pid) {
    const deadline = Date.now()+3000;
    while (Date.now()<deadline) {
      const { rows } = await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid]);
      if (rows[0]?.wait_event_type === 'Lock') return;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Expected database lock was not observed');
  }
  for (const action of ['revoke','rotate','delete']) {
    await t.test(`${action} commits first: waiting publish fails without a post`, async () => {
      await reset(); await a.query('BEGIN');
      if (action==='delete') await a.query("SELECT id FROM fixture.facilitators WHERE id='owner' FOR UPDATE");
      else {
        await a.query("SELECT id FROM fixture.facilitators WHERE id='owner' FOR KEY SHARE");
        await a.query("SELECT id FROM fixture.identities WHERE id='voice' FOR UPDATE");
        await a.query("SELECT id FROM fixture.tokens WHERE id='token' FOR UPDATE");
      }
      const pending = publish(b).then(() => ({ ok: true }), error => ({ error }));
      await waitBlocked(b.processID);
      if (action==='revoke') await a.query("UPDATE fixture.grants SET revoked=true WHERE id='grant'");
      if (action==='rotate') await a.query("UPDATE fixture.tokens SET active=false WHERE id='token'");
      if (action==='delete') await a.query("DELETE FROM fixture.facilitators WHERE id='owner'");
      await a.query('COMMIT'); assert.ok((await pending).error); assert.equal((await counts()).posts,0);
    });
    await t.test(`publish commits first: ${action} waits, then prevents later writes`, async () => {
      await reset(); await a.query('BEGIN'); await publish(a);
      const operation = action==='delete' ? "DELETE FROM fixture.facilitators WHERE id='owner'" : action==='rotate' ? "UPDATE fixture.tokens SET active=false WHERE id='token'" : "UPDATE fixture.grants SET revoked=true WHERE id='grant'";
      const pending = b.query(operation); await waitBlocked(b.processID); await a.query('COMMIT'); await pending;
      await assert.rejects(publish(b)); assert.equal((await counts()).posts,1);
    });
  }
  await t.test('handoff binds secret, owner/session, transaction, client, redirect and grant; consume once', async () => {
    await reset();
    await admin.query("INSERT INTO fixture.handoffs(id,secret_hash,owner_id,session_nonce,transaction_id,client_id,redirect_uri,grant_id) VALUES('handoff',digest('secret','sha256'),'owner','session','tx','client','https://client.example/cb','grant')");
    const values = ['handoff','secret','owner','session','tx','client','https://client.example/cb','grant'];
    const sql = 'SELECT fixture.consume_handoff($1,$2,$3,$4,$5,$6,$7,$8)';
    for (let i=1;i<values.length;i++) { const wrong=[...values]; wrong[i]='substitution'; await assert.rejects(a.query(sql,wrong)); }
    const outcomes = await Promise.allSettled([a.query(sql,values),b.query(sql,values)]);
    assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
    await assert.rejects(a.query(sql,values));
    await admin.query("UPDATE fixture.handoffs SET consumed=false,expires=now()-interval '1 second'");
    await assert.rejects(a.query(sql,values));
  });
  await t.test('untrusted role cannot read capability/draft/receipt tables or bypass wrapper', async () => {
    await reset(); await a.query('SET ROLE fixture_caller');
    try {
      for (const table of ['grants','drafts','receipts','tokens']) await assert.rejects(a.query('SELECT * FROM fixture.'+table), { code: '42501' });
      await assert.rejects(a.query("SELECT fixture.agent_create_post('synthetic-tc-secret','body','parent','discussion')"), { code: '42501' });
      await assert.rejects(a.query("SELECT fixture.publish('wrong','grant','draft',1)"));
      await publish(a);
    } finally { await a.query('RESET ROLE'); }
  });
});
