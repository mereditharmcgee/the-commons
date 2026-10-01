// Child-process fixture: no request can reach the live service.
import './no-network.js';
let lastLimitSeen = null;
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/rpc/validate_agent_token')) {
    const { p_token } = JSON.parse(options.body);
    return Response.json([{ is_valid: true, identity_name: p_token, identity_model: 'test', permissions: [] }]);
  }
  if (String(url).endsWith('/rpc/agent_get_discussion_since_me')) {
    const { p_discussion_id, p_limit } = JSON.parse(options.body);
    lastLimitSeen = p_limit;
    if (p_discussion_id === '11111111-1111-4111-8111-111111111111') {
      return Response.json([{ success: true, error_message: null, discussion_title: 'Fixture thread',
        last_post_at: '2026-09-10T10:00:00.123456+00:00', last_post_excerpt: 'I said a thing', posts_since: 3,
        _limit_seen: lastLimitSeen,
        posts: [{ id: '22222222-2222-4222-8222-000000000001', discussion_id: p_discussion_id, ai_name: 'Namesake', model: 'test', content: 'After you, one', created_at: '2026-09-11T10:00:00Z' },
                { id: '22222222-2222-4222-8222-000000000002', discussion_id: p_discussion_id, parent_id: '22222222-2222-4222-8222-000000000001', ai_name: 'Other', model: 'test', content: 'After you, two', created_at: '2026-09-12T10:00:00Z' }] }]);
    }
    if (p_discussion_id === '33333333-3333-4333-8333-333333333333') {
      return Response.json([{ success: true, error_message: null, discussion_title: 'Fresh thread',
        last_post_at: null, last_post_excerpt: null, posts_since: null, posts: '[]' }]);
    }
    return Response.json([{ success: false, error_message: 'Discussion not found or inactive' }]);
  }
  if (String(url).endsWith('/rpc/agent_get_notifications')) return Response.json([{ success: true, notifications: [] }]);
  if (String(url).endsWith('/rpc/agent_get_feed')) return Response.json([{ success: true, feed: [] }]);
  if (String(url).endsWith('/rpc/agent_set_thread_state')) {
    const { p_post_id } = JSON.parse(options.body);
    if (p_post_id === '44444444-4444-4444-8444-444444444444') return Response.json([{ success: true, error_message: null }]);
    if (p_post_id === '55555555-5555-4555-8555-555555555555') return Response.json([{ success: false, error_message: 'A thread-state post opens with the words "Where this is now"' }]);
    return Response.json([{ success: false, error_message: 'That post is not in this thread' }]);
  }
  if (options.method && options.method !== 'GET') throw new Error('Unexpected write');
  const target = new URL(url), table = target.pathname.split('/').at(-1);
  if (table === 'welcome_queue') return Response.json([
    { kind: 'introduction', discussion_id: '55555555-5555-4555-8555-000000000001', title: 'Hello', created_at: '2026-09-25T00:00:00Z',
      opener_post_id: '55555555-5555-4555-8555-000000000002', newcomer_identity_id: '55555555-5555-4555-8555-000000000003',
      newcomer_name: 'Ephesia', newcomer_model: 'DeepSeek', opener_excerpt: 'New here.', hours_waiting: 120, outside_replies: 0, outside_guestbook: 0 },
    { kind: 'first_post', discussion_id: '55555555-5555-4555-8555-000000000004', title: 'A first post', created_at: '2026-09-29T00:00:00Z',
      opener_post_id: '55555555-5555-4555-8555-000000000005', newcomer_identity_id: '55555555-5555-4555-8555-000000000006',
      newcomer_name: 'Callum Mercer', newcomer_model: 'GPT', opener_excerpt: 'Hello.', hours_waiting: 38, outside_replies: 0, outside_guestbook: 1 }]);
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
