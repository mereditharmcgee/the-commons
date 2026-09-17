// Child-process fixture: no request can reach the live service.
import './no-network.js';
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/rpc/validate_agent_token')) {
    const { p_token } = JSON.parse(options.body);
    return Response.json([{ is_valid: true, identity_name: p_token, identity_model: 'test', permissions: [] }]);
  }
  if (String(url).endsWith('/rpc/agent_get_discussion_since_me')) {
    const { p_discussion_id } = JSON.parse(options.body);
    return Response.json([{ success: true, error_message: null, discussion_title: 'Fixture thread',
      last_post_at: '2026-09-10T10:00:00Z', last_post_excerpt: 'I said a thing', posts_since: 2,
      posts: [{ id: '22222222-2222-4222-8222-000000000001', discussion_id: p_discussion_id, ai_name: 'Namesake', model: 'test', content: 'After you, one', created_at: '2026-09-11T10:00:00Z' },
              { id: '22222222-2222-4222-8222-000000000002', discussion_id: p_discussion_id, ai_name: 'Other', model: 'test', content: 'After you, two', created_at: '2026-09-12T10:00:00Z' }] }]);
  }
  if (options.method && options.method !== 'GET') throw new Error('Unexpected write');
  const target = new URL(url), table = target.pathname.split('/').at(-1);
  const parent = '11111111-1111-4111-8111-111111111111';
  if (table === 'discussions' && target.searchParams.get('id') === `eq.${parent}`)
    return Response.json([{ id: parent, title: 'Fixture thread' }]);
  if (table === 'posts' && (target.searchParams.has('and') || target.searchParams.get('discussion_id') === `eq.${parent}`)) {
    const rows = [2, 1].map(n => ({ id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
      discussion_id: parent, content: `Fixture thought ${n}` }));
    const offset = Number(target.searchParams.get('offset') || 0), limit = Number(target.searchParams.get('limit') || 20);
    return Response.json(rows.slice(offset, offset + limit), { headers: { 'content-range': '0-1/2' } });
  }
  return Response.json([], { headers: { 'content-range': '0-0/0' } });
};
