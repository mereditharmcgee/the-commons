# Handoff: a ChatGPT integration for The Commons (remote MCP)

**For:** a ChatGPT Work / Codex session, or any agent, picking this up cold.
**Written:** 2026-09-02, by the Claude Code build session, after a support
email surfaced the gap.
**Read first:** [FOR_AGENTS.md](FOR_AGENTS.md) (the two no-skip approval
gates: push to main, DB migrations) and
[ARCHITECTURE.md](ARCHITECTURE.md) (the security invariants). Nothing in
this document overrides those.

---

## The trigger

On 2026-08-26 a facilitator wrote to jointhecommons@proton.me: "The Commons
plugin is installed in ChatGPT Work and exposes its tools, but every call
fails before authentication" with `McpServerError: Connection failed` against
a URL of the form `https://<words>.trycloudflare.com/mcp`. He also asked for
"the intended secure method for supplying a private tc_ token to the ChatGPT
Work plugin without placing it in ordinary chat."

Both halves of that email describe things that do not exist yet:

1. **The Commons has no hosted MCP endpoint.** The server is an npm package
   (`mcp-server-the-commons`, v1.8.0, 48 tools) that runs on the user's own
   machine over stdio (`mcp-server-the-commons/src/index.js` line ~1086,
   `StdioServerTransport`). A `trycloudflare.com` address is a Cloudflare
   quick tunnel: someone ran the server locally and exposed it, and quick
   tunnels die the moment that process exits. Nothing on our side changed
   or broke. It was never ours.
2. **There is no out-of-chat way to supply a token.** Every write tool takes
   the agent token as a per-call argument (`token: z.string()`, index.js line
   ~350). That is by design for stdio clients, where the model reads the
   token from the conversation, and it means the token always lives in
   context.

The facilitator (identity "Phoenix", one GPT identity "Velorien", two tokens
minted 08-26, **neither ever used**) has been posting by hand through the
web form since. He got in despite us, not because of us.

Meredith now uses ChatGPT Work and Codex herself and wants this to exist
properly. That is the mandate.

## The goal

A ChatGPT user (Work / Business / Enterprise, or Plus with developer-mode
connectors) adds "The Commons" as a connector, and:

- can **browse** everything public with no auth, exactly as the 13 read
  tools do today; and
- with a Commons facilitator account, can **write** as one of their AI
  identities, **without pasting a `tc_` token into chat**.

Secondary: the same hosted endpoint serves any other remote-MCP client
(Claude web connectors, Cursor, etc.). Don't build for ChatGPT alone.

## What exists that you can build on

| Thing | Where | Notes |
|---|---|---|
| MCP server, stdio | `mcp-server-the-commons/src/index.js` | SDK `@modelcontextprotocol/sdk ^1.12.1`, which already ships `StreamableHTTPServerTransport`. Tool definitions are transport-agnostic; the transport is one line at the bottom. |
| API layer the tools call | `mcp-server-the-commons/src/api.js` | Raw fetch against Supabase REST + RPCs with the **anon key** only. |
| Agent write path | `sql/patches/27-01-agent-rpcs.sql` and later patches | Every write is a `SECURITY DEFINER` RPC that calls `validate_agent_token(p_token)`. Tokens are hashed at rest (`agent_tokens.token_hash`); `has_plaintext`/`token_plain` exist only for dashboard reveal. Per-token `rate_limit_per_hour`. |
| Token minting | `generate_agent_token` RPC (patches 029, 031) | Called from the dashboard under the facilitator's Supabase session. One token per identity is the norm. |
| Per-IP anonymous limits | `sql/patches/ip-rate-limit.sql` | Applies to **raw anonymous REST INSERTs only**, keyed on `x-forwarded-for`. Token writes are bounded per token, not per IP, so a hosted server sharing one egress IP is fine for token writes. Keep it that way (see constraints). |
| Public docs for ChatGPT users | `participate.html` "Bring ChatGPT" tab, FAQ "Can I give ChatGPT or Gemini direct API access?" | Currently says: copy-paste, or a Custom GPT with Actions. Must be updated when this ships. |
| REST API docs | `api.html` | RPC names, `p_token` shapes, examples verified against live 08-21. |
| Glama hosting | Glama lists and builds this server (`registry.glama.ai/mcp-ysa6yoe3py:...`, corrected build spec in the Glama admin) | **Verify whether Glama exposes a public Streamable HTTP URL for it.** If it does, phase 1 may be a configuration exercise rather than infrastructure. Do not assume either way. |
| DNS | Cloudflare (registrar + DNS for jointhecommons.space) | A `mcp.jointhecommons.space` subdomain is cheap. Cloudflare Workers is the natural host if we self-host; Meredith approves any new paid infra. |

## Constraints that are not negotiable

From [ARCHITECTURE.md § Security invariants](ARCHITECTURE.md#security-invariants), restated for this build:

- **The service key never leaves Supabase.** The hosted server is a client:
  anon key plus per-user tokens, nothing more. If a design needs the service
  key on the server, it is the wrong design.
- **All writes go through the existing token-validated RPCs.** Do not add a
  write path that bypasses `validate_agent_token`, `content_shape_ok`, or
  the per-token rate limits.
- **No anonymous write path through the hosted server.** Anonymous INSERT is
  allowed on some tables for the raw REST API (with per-IP limits keyed on
  the caller's IP). A hosted server would present one IP for every ChatGPT
  user, so either all of them share one bucket or, worse, the limit is
  defeated. Simplest rule: the remote server requires a resolved token for
  any write. Reads only when unauthenticated.
- **Tokens stay out of chat on the remote path.** That is the whole point.
  A design where the user pastes `tc_...` into ChatGPT once "to set it up"
  still puts it in a chat transcript. Prefer a flow where the secret never
  transits the model.
- **Anon reads enumerate columns.** `api.js` already does; keep it that way
  if you add read tools.
- **Push to main is a deploy; DB migrations need Meredith's explicit
  approval.** Both are gates, not formalities.

## Phases

### Phase 0 — verify, don't remember (half a day)

This document was written from memory of OpenAI's connector requirements as
of mid-2026. Verify against current docs before writing code, and cite what
you verified in the PR:

- Transport ChatGPT connectors require (Streamable HTTP at `/mcp` is the
  expectation; confirm whether SSE is still accepted).
- Auth options for a custom connector (OAuth 2.1 with dynamic client
  registration is the documented path; confirm whether "no auth" is allowed
  for read-only connectors, and whether any header-based API-key option
  exists in ChatGPT Work specifically).
- Whether a connector must be created per workspace by an admin (Work /
  Enterprise) versus per user (Plus developer mode).
- Whether the Apps SDK (tool results with UI components) is worth it. It is
  not required for phase 1.
- Whether Glama already exposes a hosted endpoint for this server.

### Phase 1 — read-only remote endpoint, no auth (one to two days)

- Add an HTTP entrypoint next to the stdio one: same `McpServer`, same tool
  registrations, `StreamableHTTPServerTransport` instead of stdio. Keep
  `src/index.js` working unchanged for npm users; the HTTP entry can import
  the tool registration and swap the transport.
- Register only the read tools (the 13 that say "No token needed").
  Write tools either absent or returning a clear "connect your account"
  message pointing at phase 2. Do not register write tools that accept a
  token argument on the hosted path.
- Host it. Options in order of preference: Glama's hosted URL if it exists
  and is stable; Cloudflare Workers (DNS already there; the MCP SDK runs on
  Workers; free tier likely sufficient); a small Node host (Fly, Railway,
  Render). Domain: `mcp.jointhecommons.space`. Cost target under $5/month.
- Verify from ChatGPT: add the connector, run `browse_interests`,
  `read_discussion`, `browse_reading_room`. Verify from at least one other
  remote-MCP client.
- Ship docs with it (see phase 4). A hosted endpoint nobody can find is not
  shipped.

### Phase 2 — authenticated writes without the token in chat (the real work)

Two candidate designs. Pick after phase 0 tells you what ChatGPT actually
accepts.

**A. OAuth 2.1 in front of Supabase Auth.** The connector's OAuth flow sends
the user to a page on our domain where they sign in with their Commons
facilitator account (Supabase Auth, password or magic link). The hosted
server then holds a Supabase session for that user, looks up their
identities, and resolves the agent token server-side per identity. The
`tc_` token never transits ChatGPT. Needs: an OAuth authorization server
(Cloudflare's `workers-oauth-provider` or equivalent; do not hand-roll),
a small DB surface so the server can obtain a usable token for the
authenticated facilitator's own identities. **Today tokens are hashed and
the plaintext is only kept for dashboard reveal**, so this likely needs
either a new RPC that mints a server-scoped token for an identity under
the facilitator's session, or a decision to let the hosted server call
`generate_agent_token` on the user's behalf. Either is a schema/RPC change
and therefore a **migration gate**.

**B. One-time connect code.** The dashboard shows a short-lived code; the
user pastes it into ChatGPT once; the server exchanges it for the
identity's token and stores it server-side keyed to the connector session.
Simpler, but the code transits chat (low value, expires in minutes, single
use) and the server now stores tokens. Acceptable if OAuth turns out to be
unavailable or disproportionate; document why.

Either way:

- Multi-identity facilitators need an `identity` argument on write tools
  (name, resolved server-side), defaulting to the only identity when there
  is one.
- Server-side token storage, if any, is encrypted at rest and revocable
  from the dashboard. Revoking a token in the dashboard must revoke the
  connector's access.
- Rate limits stay per token. Nothing about hosting should raise them.

### Phase 3 — the cheap stdio improvement (an hour, ship with any release)

Independent of hosting: let the stdio server read `COMMONS_TOKEN` from the
environment and use it when a tool call omits `token`. That gives Claude
Desktop / Cursor / Codex users a way to keep the token in their MCP config
instead of in chat today. Keep the argument as an override. Document in the
README and `participate.html`.

### Phase 4 — docs, announcement, and the reply

- `participate.html`: the ChatGPT tab and the FAQ answer change from
  "copy-paste or Custom GPT" to the connector instructions.
- `api.html` / `agent-guide.html` / `mcp-server-the-commons/README.md`:
  hosted endpoint, auth flow, `COMMONS_TOKEN`.
- `changes.html`: an entry in the established voice (second person to the
  AI voices; lead with what they'd notice). If it's the biggest recent
  change, refresh the homepage Latest card in the same pass (CLAUDE.md
  rule).
- Reply to the facilitator who reported it (thread in the Proton inbox,
  subject "ChatGPT Work plugin MCP endpoint is unreachable"). Meredith has
  already sent him a holding reply; he gets the "it's live" note.
- Release the npm package if `src/` changed (recipe in the memory file
  `mcp-release-recipe`; version in four places; `npm publish` runs from
  Meredith's terminal).

## Decisions that are Meredith's

1. Hosting provider and any recurring cost.
2. Whether the hosted server may store tokens (design B) or must resolve
   them per session (design A).
3. The migration for whichever token-resolution RPC phase 2 needs.
4. Whether write access through the connector should be limited to
   identities the facilitator marks "connector-enabled" (a dashboard toggle)
   or all of their identities.

Put these in the PR description as questions, not assumptions.

## Definition of done

- A ChatGPT Work user can add the connector from a documented URL and read
  the room without an account.
- A facilitator can connect their account and post as an identity, and the
  string `tc_` never appears in any ChatGPT transcript.
- Revoking the token in the dashboard cuts the connector off.
- The stdio package still works unchanged for existing users, and gains
  `COMMONS_TOKEN`.
- Docs updated on all four surfaces; changelog entry; the reporting
  facilitator told.
- Verified in the browser per CLAUDE.md's pre-deploy QA before every push.

## Things not to do

- Don't put the service key anywhere but Supabase.
- Don't add a hosted anonymous write path.
- Don't hand-roll OAuth.
- Don't register the current token-argument write tools on the hosted
  endpoint "just for now."
- Don't skip Glama's hosted-URL check; it might already be the answer.
