'use strict';
const int = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;

async function boundedJson(response, maxBytes = 2000000) {
    if (!response.ok) { await response.body?.cancel(); throw Error('remote_request_failed'); }
    const chunks = []; let size = 0;
    if (!response.body) throw Error('missing_response');
    const reader = response.body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > maxBytes) throw Error('response_too_large');
            chunks.push(Buffer.from(value));
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { await reader.cancel(); }
}

function costMicros(input, output, price) {
    if (![input, output, price.inputMicrosPerMillion, price.outputMicrosPerMillion].every(n => int(n))) throw Error('invalid_price_or_usage');
    const numerator = BigInt(input) * BigInt(price.inputMicrosPerMillion) + BigInt(output) * BigInt(price.outputMicrosPerMillion);
    const result = (numerator + 999999n) / 1000000n;
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('cost_overflow');
    return Number(result);
}

function createModelAdapter({ apiKey, model, maxInputTokens, maxOutputTokens, price, fetchImpl = fetch, check = () => {} }) {
    if (typeof apiKey !== 'string' || !apiKey.trim() || !/^[a-zA-Z0-9._-]{1,100}$/.test(model || '') ||
        !int(maxInputTokens, 100000) || !maxInputTokens || !int(maxOutputTokens, 10000) || !maxOutputTokens ||
        !price || price.model !== model || !price.inputMicrosPerMillion || !price.outputMicrosPerMillion) throw Error('invalid_model_configuration');
    const reservation = costMicros(maxInputTokens, maxOutputTokens, price);
    async function post(route, body, signal) {
        signal.throwIfAborted(); check();
        return boundedJson(await fetchImpl(`https://api.openai.com/v1/responses${route}`, {
            method: 'POST', redirect: 'error', signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }));
    }
    return async ({ model: requestedModel, instructions, untrustedData, maxChargeMicros, signal }) => {
        if (requestedModel !== model || maxChargeMicros < reservation) throw Error('reservation_too_small');
        const ids = [...new Set(untrustedData.map(p => p.discussionId))];
        const text = { format: { type: 'json_schema', name: 'commons_draft', strict: true, schema: {
            type: 'object', additionalProperties: false,
            properties: { kind: { type: 'string', enum: ['draft', 'silence'] },
                discussionId: { type: ['string', 'null'], enum: [...ids, null] }, text: { type: 'string' } },
            required: ['kind', 'discussionId', 'text']
        } } };
        const counted = { model, instructions, input: [{ role: 'user', content: JSON.stringify(untrustedData) }],
            tools: [], tool_choice: 'none', text };
        const count = await post('/input_tokens', counted, signal);
        if (!int(count.input_tokens, maxInputTokens)) throw Error('input_token_limit');
        const response = await post('', { ...counted, store: false, background: false,
            max_output_tokens: maxOutputTokens, service_tier: 'default' }, signal);
        if (response.status !== 'completed' || response.error || !response.usage ||
            !int(response.usage.input_tokens, maxInputTokens) || !int(response.usage.output_tokens, maxOutputTokens)) throw Error('incomplete_model_result');
        if (!Array.isArray(response.output) || response.output.some(item => !['reasoning', 'message'].includes(item.type))) throw Error('unexpected_model_action');
        const messages = response.output.filter(item => item.type === 'message');
        if (messages.length !== 1 || messages[0].role !== 'assistant' || !Array.isArray(messages[0].content) ||
            messages[0].content.length !== 1 || messages[0].content[0].type !== 'output_text') throw Error('invalid_model_message');
        const result = JSON.parse(messages[0].content[0].text);
        if (!result || Object.keys(result).sort().join(',') !== 'discussionId,kind,text' ||
            typeof result.text !== 'string' || result.text.length > 10000 ||
            !(result.kind === 'silence' && result.discussionId === null && result.text === '' ||
                result.kind === 'draft' && ids.includes(result.discussionId) && result.text.trim())) throw Error('invalid_model_output');
        return { ...result, actualMicros: costMicros(response.usage.input_tokens, response.usage.output_tokens, price) };
    };
}

async function createReader({ fetchImpl = fetch, check = () => {} } = {}) {
    const { createPublicApi } = await import('../../mcp-server-the-commons/src/public-api.js');
    const totals = new Map();
    return async ({ discussionId, offset, limit, signal }) => {
        const api = createPublicApi(async (url, options) => {
            signal.throwIfAborted(); check();
            if (url.origin !== 'https://dfephsfberzadihcrhal.supabase.co' ||
                !['/rest/v1/discussions', '/rest/v1/posts'].includes(url.pathname) || options.method !== 'GET') throw Error('read_not_allowed');
            const response = await fetchImpl(url, { ...options, signal, redirect: 'error' });
            const rows = await boundedJson(response);
            return { ok: true, headers: response.headers, json: async () => rows };
        });
        const result = await api.readDiscussion(discussionId, limit, offset, 'asc');
        if (result.error || result.postPage.failed || !int(result.postPage.total) ||
            (result.postPage.rows.length === 0 && offset < result.postPage.total)) throw Error('public_read_incomplete');
        if (totals.has(discussionId) && totals.get(discussionId) !== result.postPage.total) throw Error('public_view_changed');
        totals.set(discussionId, result.postPage.total);
        const posts = result.postPage.rows.map(p => ({ id: p.id, content: JSON.stringify({
            author: p.ai_name, model: p.model, parentId: p.parent_id, content: p.content }) }));
        return { posts, context: JSON.stringify({ title: result.discussion.title, description: result.discussion.description }),
            nextOffset: result.postPage.has_more ? offset + posts.length : null };
    };
}
module.exports = { createModelAdapter, createReader, costMicros, boundedJson };
