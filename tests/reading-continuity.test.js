const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const stateSource = fs.readFileSync('js/reading-state.js', 'utf8');
const uiSource = fs.readFileSync('js/reading-continuity.js', 'utf8');
const id = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const before = '2026-09-01T00:00:00Z', after = '2026-09-09T00:00:00Z';
const entry = n => ({ discussion_id: id(n), post_id: id(100+n), post_created_at: before, saved_at: after, latest_reply_at: before });
function memory() {
    const data = new Map();
    return { data, getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
}
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.textContent = ''; this.hidden = false; this.disabled = false; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(k, f) { this.events[k] = f; }
    setAttribute(k,v) { this[k] = v; }
    focus() { this.focused = true; }
    select() { this.selected = true; }
    closest() { return this; }
}
function harness(rootId, get = async () => [], clipboard, storage = memory()) {
    const root = new Element('section'), docEvents = {}, winEvents = {};
    const context = vm.createContext({ TextEncoder, URLSearchParams, Date, localStorage: storage,
        location: { search: '?id='+id(1) }, navigator: clipboard ? { clipboard } : {},
        CONFIG: { api: { discussions: 'discussions', discussion_stats: 'discussion_stats' } }, Utils: { get },
        document: { getElementById: key => key === rootId ? root : null, createElement: tag => new Element(tag), addEventListener: (k,f) => docEvents[k] = f },
        window: { addEventListener: (k,f) => winEvents[k] = f } });
    vm.runInContext(stateSource + '\n' + uiSource + '\nglobalThis.api = ReadingContinuity; globalThis.state = ReadingState;', context);
    const walk = e => [e, ...e.children.flatMap(walk)];
    return { ...context, root, storage, docEvents, winEvents, nodes: () => walk(root), button: text => walk(root).find(e => e.tag === 'button' && e.textContent === text) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('explicit saves persist only bounded identifiers/times; replacement and clear preserve unrelated storage', () => {
    const h = harness(), store = h.state.createStore(() => h.storage, () => after);
    h.storage.setItem('auth-token', 'untouched'); h.storage.setItem('visit-marker', 'untouched');
    for(let n=1;n<=20;n++) assert.equal(store.save(id(n),id(100+n),before,before).ok,true);
    const full = h.storage.getItem(h.state.KEY);
    assert.equal(store.save(id(21),id(121),before).ok,false); assert.equal(h.storage.getItem(h.state.KEY),full);
    assert.equal(store.save(id(1),id(999),before).ok,true); assert.equal(store.load().entries.length,20);
    assert.equal(store.load().entries.find(e=>e.discussion_id===id(1)).post_id,id(999));
    assert.deepEqual(Object.keys(JSON.parse(full).entries[0]).sort(),['discussion_id','latest_reply_at','post_created_at','post_id','saved_at']);
    assert.equal(store.remove(id(2)).ok,true); assert.equal(store.load().entries.length,19);
    assert.equal(store.clear().ok,true); assert.equal(h.storage.data.size,2);
});
test('malformed, future, oversized and invalid saved records are not silently replaced', () => {
    const h=harness(), store=h.state.createStore();
    for(const raw of ['{',JSON.stringify({version:2,entries:[]}), ' '.repeat(16385), JSON.stringify({version:1,entries:[{...entry(1),post_id:'javascript:alert(1)'}]}), JSON.stringify({version:1,entries:[{...entry(1),title:'private'}]}), JSON.stringify({version:1,entries:[entry(1),entry(1)]})]) {
        h.storage.setItem(h.state.KEY,raw); assert.ok(store.load().error);
        assert.equal(store.save(id(1),id(2),before).ok,false); assert.equal(h.storage.getItem(h.state.KEY),raw);
    }
});
test('blocked storage and quota failures never report success', () => {
    const h=harness(); const blocked=h.state.createStore(()=>{throw Error('blocked');});
    assert.ok(blocked.load().error); assert.equal(blocked.clear().ok,false); assert.equal(blocked.save(id(1),id(2),before).ok,false);
    const quota=h.state.createStore(()=>({getItem:()=>null,setItem(){throw Error('quota');}}));
    assert.equal(quota.save(id(1),id(2),before).ok,false);
});
test('recent batches consume stats rows, omit unavailable parents and preserve lookahead', async () => {
    const calls=[], h=harness();
    const api=h.api.createApi(async(table,params)=>{calls.push({table,params}); return table==='discussion_stats'
        ? Array.from({length:21},(_,i)=>({discussion_id:id(i+1),last_post_at:after}))
        : [{id:id(20),title:'old thread',created_at:'2020-01-01',is_active:true},{id:id(1),title:'hidden',is_active:false}]; });
    const page=await api.recent(0); assert.equal(page.rows.length,1); assert.equal(page.rows[0].id,id(20));
    assert.equal(page.next,20); assert.equal(calls.length,2); assert.equal(calls[0].params.order,'last_post_at.desc,discussion_id.desc');
    assert.equal(calls[0].params.limit,'21'); assert.ok(!calls[1].params.id.includes(id(21)));
    assert.equal((await api.recent(100000)).next,null);
    await assert.rejects(()=>api.recent(-1)); await assert.rejects(()=>api.recent(100001));
});
test('empty and final reply batches do not invent continuation; parent failures propagate', async () => {
    const h=harness();
    for(const size of [0,20]) { const api=h.api.createApi(async t=>t==='discussion_stats'?Array.from({length:size},(_,i)=>({discussion_id:id(i),last_post_at:after})):[]);
        const page=await api.recent(); assert.equal(page.next,null); assert.equal(page.rows.length,0); }
    await assert.rejects(()=>h.api.createApi(async t=>{if(t==='discussions')throw Error('offline');return [{discussion_id:id(1),last_post_at:after}];}).recent());
});
test('briefing compares server timestamps only, bounds requests and copies available source material', async () => {
    const h=harness(), calls=[];
    const api=h.api.createApi(async(t,p)=>{calls.push({t,p}); return t==='discussions'?[1,2,3,4].map(n=>({id:id(n),title:'<img onerror=bad>'+ 'x'.repeat(300),is_active:true}))
        : [1,2,3,4].map(n=>({discussion_id:id(n),last_post_at:n===1?after:before}));});
    const records=[entry(1),entry(2),{...entry(3),latest_reply_at:null},entry(5)];
    const original=JSON.stringify(records), rows=await api.briefing(records,true);
    assert.equal(calls.length,2); assert.equal(rows[0].newer,true); assert.match(rows[1].status,/No later reply/);
    assert.match(rows[2].status,/unavailable/); assert.equal(rows[3].available,false); assert.equal(JSON.stringify(records),original);
    const note=h.api.note(rows,after); assert.match(note,/does not authorize posting/); assert.ok(!note.includes(id(5)));
    assert.ok(note.length<3000); assert.equal(rows[0].title.length,200);
    await assert.rejects(()=>api.briefing(Array.from({length:6},(_,i)=>entry(i)),true));
});
test('recent UI retains last batch on failure and retries the same offset', async () => {
    let fail=false;const offsets=[];
    const h=harness('recent-replies',async(t,p)=>{if(t==='discussions')return [{id:id(1),title:'Visible',is_active:true}];offsets.push(p.offset);if(fail)throw Error('offline');return Array.from({length:21},()=>({discussion_id:id(1),last_post_at:after}));});
    await flush();fail=true;await h.button('More recent replies').events.click();
    assert.ok(h.nodes().some(e=>e.textContent==='Visible'));assert.ok(h.nodes().some(e=>/retained/.test(e.textContent)));
    fail=false;await h.button('Retry recent replies').events.click();assert.deepEqual(offsets,['0','20','20']);
});
test('save baseline failure still saves; a clear in another tab cancels pending save', async () => {
    const h=harness('discussion-reading',async()=>{throw Error('offline');});
    const target=new Element('button');target.dataset={readingSave:id(101),readingCreated:before};
    await h.docEvents.click({target});assert.equal(h.state.createStore().load().entries[0].latest_reply_at,null);
    let resolve;h.Utils.get=()=>new Promise(r=>resolve=r);
    const pending=h.docEvents.click({target});h.storage.removeItem(h.state.KEY);h.winEvents.storage({key:h.state.KEY});resolve([]);await pending;
    assert.equal(h.state.createStore().load().entries.length,0);assert.equal(target.disabled,false);
    assert.ok(!h.nodes().some(e=>e.textContent==='Saving your place…'));
});
test('home checks retain prior time on failure, copy fallback, and clear ignores stale network results', async () => {
    const storage=memory();storage.setItem('commons_reading_v1',JSON.stringify({version:1,entries:[entry(1)]}));
    let fail=false, defer=false; const resolvers=[];
    const h=harness('saved-reading',async(t)=>{if(defer)return new Promise(r=>resolvers.push(r));if(fail)throw Error('offline');return t==='discussions'?[{id:id(1),title:'<img onerror=bad>',is_active:true}]:[{discussion_id:id(1),last_post_at:after}];},null,storage);
    await flush();const saved=storage.getItem(h.state.KEY);await h.button('Check for updates').events.click();
    assert.ok(h.nodes().some(e=>/A newer reply/.test(e.textContent)));assert.equal(storage.getItem(h.state.KEY),saved);
    fail=true;await h.button('Check for updates').events.click();assert.ok(h.nodes().some(e=>/Last successful check:/.test(e.textContent)));
    await h.button('Copy return note').events.click();const fallback=h.nodes().find(e=>e.tag==='textarea');assert.ok(fallback.selected&&!fallback.hidden);assert.match(fallback.value,/Saved post:/);
    fail=false;defer=true;const pending=h.button('Retry updates').events.click();
    await h.button('Clear saved places').events.click();resolvers.forEach(resolve=>resolve([])); await pending;
    await flush();assert.ok(fallback.hidden);assert.equal(fallback.value,'');assert.ok(h.button('Check for updates').disabled);
});
test('HTML integration loads state before discussion rendering and keeps all sections accessible',()=>{
    for(const [page,root] of [['index','saved-reading'],['interests','recent-replies'],['discussion','discussion-reading']]) {
        const html=fs.readFileSync(page+'.html','utf8');assert.match(html,new RegExp('id="'+root+'"[^>]*aria-labelledby='));
        assert.ok(html.indexOf('reading-state.js')<html.indexOf('reading-continuity.js'));
        if(page==='discussion') assert.ok(html.indexOf('reading-state.js')<html.indexOf('js/discussion.js'));
    }
});
test('manual saved groups fetch five at a time; cross-tab clear also cancels clipboard fallback', async()=>{
    const storage=memory();storage.setItem('commons_reading_v1',JSON.stringify({version:1,entries:Array.from({length:12},(_,i)=>entry(i+1))}));
    const calls=[];let rejectCopy;
    const h=harness('saved-reading',async(t,p)=>{calls.push(p);return Array.from({length:12},(_,i)=>({id:id(i+1),title:'Conversation',is_active:true}));},
        {writeText:()=>new Promise((_,reject)=>rejectCopy=reject)},storage);
    await flush();assert.equal(calls.length,1);assert.equal(calls[0].limit,'5');
    await h.button('Next saved places').events.click();await flush();assert.equal(calls.length,2);assert.equal(calls[1].limit,'5');assert.ok(calls[1].id.includes(id(6)));
    const copying=h.button('Copy return note').events.click();storage.removeItem(h.state.KEY);h.winEvents.storage({key:h.state.KEY});rejectCopy(Error('denied'));await copying;
    const fallback=h.nodes().find(e=>e.tag==='textarea');assert.equal(fallback.value,'');assert.equal(fallback.hidden,true);
    assert.ok(h.nodes().some(e=>/No saved places yet/.test(e.textContent)));
});
test('last explicit save wins when baseline requests finish out of order', async()=>{
    const pending=[];const h=harness('discussion-reading',()=>new Promise(resolve=>pending.push(resolve)));
    const first=new Element('button'),second=new Element('button');
    first.dataset={readingSave:id(101),readingCreated:before};second.dataset={readingSave:id(102),readingCreated:before};
    const a=h.docEvents.click({target:first}), b=h.docEvents.click({target:second});
    pending[1]([{discussion_id:id(1),last_post_at:after}]);await b;
    pending[0]([{discussion_id:id(1),last_post_at:before}]);await a;
    const saved=h.state.createStore().load().entries[0];assert.equal(saved.post_id,id(102));assert.equal(saved.latest_reply_at,after);
});
test('a bookmark survives leaving the page before its baseline request finishes', async()=>{
    let resolve;const h=harness('discussion-reading',()=>new Promise(r=>resolve=r));
    const target=new Element('button');target.dataset={readingSave:id(101),readingCreated:before};
    const pending=h.docEvents.click({target});
    const returning=harness('saved-reading',async()=>[{id:id(1),title:'Conversation',is_active:true}],null,h.storage);
    assert.equal(returning.state.createStore().load().entries[0]?.post_id,id(101));
    assert.ok(h.nodes().some(e=>e.textContent.startsWith('Your place is saved.')));
    resolve([{discussion_id:id(1),last_post_at:after}]);await pending;
});
test('baseline completion preserves save time and unrelated places, and rejects replaced or removed saves',()=>{
    const h=harness(),store=h.state.createStore(()=>h.storage,()=>after);
    const saved=store.save(id(1),id(101),before).entry;
    store.save(id(2),id(102),before);
    assert.equal(store.completeBaseline(saved,before).ok,true);
    assert.equal(store.load().entries.length,2);
    assert.equal(store.load().entries.find(e=>e.discussion_id===id(1)).saved_at,after);
    const replaced=store.save(id(1),id(103),before).entry;
    assert.equal(store.completeBaseline(saved,after).ok,false);
    store.remove(id(1));assert.equal(store.completeBaseline(replaced,after).ok,false);
    assert.equal(store.load().entries.length,1);
});
test('failed baseline storage keeps the immediate bookmark and does not claim the bookmark failed',async()=>{
    let resolve;const h=harness('discussion-reading',()=>new Promise(r=>resolve=r));
    const target=new Element('button');target.dataset={readingSave:id(101),readingCreated:before};
    const pending=h.docEvents.click({target});const original=h.storage.getItem(h.state.KEY);
    h.storage.setItem=()=>{throw Error('quota');};resolve([{discussion_id:id(1),last_post_at:after}]);await pending;
    assert.equal(h.storage.getItem(h.state.KEY),original);
    assert.ok(h.nodes().some(e=>/Your place is saved.*comparison is unavailable/.test(e.textContent)));
});
test('failed immediate storage never starts a baseline request',async()=>{
    let calls=0;const storage=memory();storage.setItem=()=>{throw Error('quota');};
    const h=harness('discussion-reading',async()=>{calls++;return [];},null,storage);
    const target=new Element('button');target.dataset={readingSave:id(101),readingCreated:before};
    await h.docEvents.click({target});assert.equal(calls,0);
    assert.ok(h.nodes().some(e=>/Your place was not saved/.test(e.textContent)));
});
