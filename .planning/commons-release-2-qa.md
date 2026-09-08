# Release 2 verification

September 8, 2026. Branch: `codex/release-2-first-visits`; planning base `552c6ef`.
Status: implemented and locally verified; not pushed or deployed.

## Delivered

- Three homepage entrances, route-based Participate setup, and a short Reading Room introduction using existing destinations and data.
- Canonical hosted ChatGPT setup section; advanced write examples behind disclosures. Correct MCP environment instructions and public-only copyable orientation for all five options.
- Selectable text after clipboard rejection or missing Clipboard API; announced status; keyboard navigation and state/label relationships for existing client tabs.
- Public changelog and mirrored facilitator setup guide; retained old anchors, including `chatgpt-pilot`.

## Evidence

`npm run test:discovery`: 16 pass. `npm run test:first-visits`: 6 pass (includes the two shared static checks, so 20 unique tests across both commands). Checks include all orientation choices, clipboard success/failure/missing API, keyboard selection, internal links/anchors, script parsing and R1 regressions. Network preload blocks fetch/socket access. Inline script bodies match the planning baseline after browser newline normalization; existing CSP hashes preserved. `git diff --check` passes.

Browser fixtures: localhost:8878 via `tests/fixtures/discovery_server.py`, synthetic Supabase reads and auth, blocked write methods and production connections. Twelve page/width checks covered index, Participate, Reading Room, and changes at 375/768/1280. No horizontal overflow, runtime errors, or write requests observed. Existing signed-in home feed displayed using a synthetic account with no identities. This does not verify populated real-account feeds or production RLS.

No-JavaScript fixtures retained all three entrance/route links and selectable orientation text. Reading Room empty and unavailable states retained the new introduction and their existing notices. Browser keyboard selection switched the existing client tab and exposed the correct selected state. Copy rejection/missing API recovery was verified in the offline harness. Desktop setup/Reading Room and mobile homepage were visually inspected; temporary viewport settings restored.

Five-category QA: display/responsiveness passed; synthetic data and auth presentation preserved; empty/error fallbacks passed; no new database calls, credentials, unsafe rendered data or inline scripts; local navigation/anchors passed. No real account changes, token validation, post submission, database access, remote MCP calls, or volunteer contact occurred.

External documentation checks only: npm registry reported 1.9.1, and its downloaded tarball (inspected without execution) contains `process.env.COMMONS_TOKEN`. Official [OpenAI connection guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt) was rechecked for current setup labels and workspace-policy caveat. This does not establish every client's account eligibility or certify advanced integrations.

## Usage baseline and next gate

Weekly account allowance reported **4% used before implementation and 4% at final verification**, 96% remaining. Window 10,080 minutes; reset timestamp 1789435397. There was no displayed percentage-point increase; readings are rounded and account-wide, not zero token usage or exact attribution. No model overrides or reset credits used. R1's approximately one-point delta remains a comparison, not a forecast.

Local previews: `/index.html`, `/participate.html#choose-your-route`, `/reading-room.html#first-visit` on the fixture server. Synthetic content is for QA only. Obtain explicit push approval under `docs/agents/FOR_AGENTS.md` before deployment; afterward verify Pages/CI and deployed HTTPS assets. Volunteer observation and any messaging remain separate. The release is not yet Observed.
