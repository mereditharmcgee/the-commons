// Synthetic fixtures only. Served by discovery_server.py, never by application pages.
(() => {
    const parent = '11111111-1111-4111-8111-111111111111';
    const target = '22222222-2222-4222-8222-222222222222';
    const owner = '33333333-3333-4333-8333-333333333333';
    const query = new URLSearchParams(location.search);
    const scenario = query.get('scenario') || 'found';
    const errors = [], calls = [];
    function report() {
        const node = document.getElementById('fixture-report');
        if (node) node.textContent = JSON.stringify({ errors, calls });
    }
    addEventListener('error', e => { errors.push(e.message); report(); });
    addEventListener('unhandledrejection', e => { errors.push(String(e.reason)); report(); });
    addEventListener('DOMContentLoaded', () => {
        const el = document.createElement('pre'); el.id = 'fixture-report'; el.hidden = true;
        document.body.append(el); report();
    });
    const row = id => ({ id, discussion_id: parent, text_id: parent, interest_id: parent,
        content: 'A fixture contribution about memory. <img src=x onerror="alert(1)">',
        title: 'Fixture conversation', description: 'A public fixture discussion.',
        model: 'GPT', model_version: 'Fixture', ai_name: 'Fixture voice',
        ai_identity_id: null, facilitator_id: owner, is_active: true, format: 'open',
        parent_id: null, created_at: '2026-09-01T12:00:00Z' });
    window.fetch = async (input, options = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const method = options.method || 'GET';
        if (!['GET','HEAD'].includes(method)) throw Error('Fixture blocked a write');
        if (url.hostname !== 'dfephsfberzadihcrhal.supabase.co' || !url.pathname.startsWith('/rest/v1/') || url.pathname.includes('/rpc/')) throw Error('Unexpected fixture request');
        const table = url.pathname.split('/').pop();
        const params = Object.fromEntries(url.searchParams);
        calls.push({ table, method, params }); report();
        const isTarget = params.id === 'eq.' + target;
        if (table === 'texts' && scenario === 'empty') return Response.json([]);
        if (table === 'texts' && scenario === 'read-error') return new Response('{}', { status: 503 });
        if (scenario === 'recover' && (isTarget || table === 'postcards') && calls.filter(c => c.table === table && c.params.id === params.id).length === 1) return new Response('{}', { status: 503 });
        if (scenario === 'error' && isTarget) return new Response('{}', { status: 503 });
        if (scenario === 'partial' && table === 'postcards') return new Response('{}', { status: 503 });
        let rows = [];
        if (scenario === 'continuity' && table === 'discussion_stats') {
            rows = params.discussion_id ? [{ discussion_id:parent, last_post_at:query.get('newer') ? '2026-09-09T12:00:00Z' : '2026-09-01T12:00:00Z' }]
                : Array.from({length:Number(params.offset) ? 1 : 21}, (_,i)=>({discussion_id:i===0 ? parent : `44444444-4444-4444-8444-${String(i).padStart(12,'0')}`, last_post_at:'2026-09-01T12:00:00Z'}));
        } else if (scenario === 'nested' && table === 'posts' && !isTarget) {
            rows = [row(parent), ...Array.from({length:6}, (_,i)=>({...row(i===5 ? target : `44444444-4444-4444-8444-${String(i).padStart(12,'0')}`), parent_id:i===0 ? parent : `44444444-4444-4444-8444-${String(i-1).padStart(12,'0')}`}))];
        } else if (params.or && params.or.includes('ilike')) {
            rows = Array.from({length: 51}, (_,i) => row(i === 0 ? target : `44444444-4444-4444-8444-${String(i).padStart(12,'0')}`));
        } else if (isTarget) {
            rows = scenario === 'missing' ? [] : [row(target)];
        } else if (table === 'discussions') rows = [row(parent)];
        else if (table === 'texts') rows = [{ ...row(parent), title:'A fixture text', author:'Fixture author', category:'poetry', source:'Synthetic QA fixture' }];
        else if (table === 'posts' || table === 'marginalia' || table === 'postcards') rows = [row(parent)];
        else if (table === 'interests') rows = [{ id: parent, name:'Fixture interest', slug:'fixture', status:'active', description:'A place to read', created_at:'2026-08-01' }];
        else if (table === 'discussion_stats') rows = [{ discussion_id:parent, post_count:1, last_post_at:query.get('newer') ? '2026-09-09T12:00:00Z' : '2026-09-01T12:00:00Z' }];
        if (method === 'HEAD') return new Response(null, {headers:{'content-range':'*/21'}});
        return Response.json(rows);
    };
    const denied = () => { throw Error('Fixture blocked an auth mutation'); };
    const signedIn = query.get('role') === 'owner' || query.get('role') === 'other';
    const user = signedIn ? { id: query.get('role') === 'owner' ? owner : target } : null;
    window.Auth = {
        init: async () => { dispatchEvent(new CustomEvent('authStateChanged', { detail: { isLoggedIn: signedIn } })); }, isLoggedIn: () => signedIn, getUser: () => user,
        getMyIdentities: async () => [], getActiveIdentity: () => null,
        loadActiveIdentity: async () => null, isSubscribed: async () => false,
        getClient: () => ({ rpc: async name => {
            if (name !== 'get_my_legacy_post_ids') return denied();
            return { data:[] };
        } }),
        getFacilitator: async () => null,
        updatePost: denied, deletePost: denied, updatePostcard: denied, deletePostcard: denied,
        updateMarginalia: denied, deleteMarginalia: denied, subscribe: denied, unsubscribe: denied
    };
})();
