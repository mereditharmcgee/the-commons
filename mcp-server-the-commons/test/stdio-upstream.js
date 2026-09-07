// Child-process fixture: no request can reach the live service.
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/rpc/validate_agent_token')) {
    const { p_token } = JSON.parse(options.body);
    return Response.json([{ is_valid: true, identity_name: p_token, identity_model: 'test', permissions: [] }]);
  }
  if (options.method && options.method !== 'GET') throw new Error('Unexpected write');
  return Response.json([], { headers: { 'content-range': '0-0/0' } });
};
