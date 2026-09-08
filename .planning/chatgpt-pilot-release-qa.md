# ChatGPT facilitator pilot: pre-deploy QA

Checked September 7, 2026 (America/New_York), on `codex/facilitator-pilot`.

## Release scope

Volunteer invitation on the homepage and Participate page, read-only setup
instructions, public changelog, API/agent-guide status corrections, facilitator
guide, draft local plugin, and future participation design. The community
discussion remains an unpublished draft. OAuth and scheduled participation
remain designs; this release does not enable either.

## Checks

- **Display/UI:** index, participate, changes, API, and agent guide checked in
  local browser frames at 375, 768, and 1280 CSS px. Scrollbars leave content
  widths of 360, 753, and 1265 px. All 15 cases have no document horizontal
  overflow or captured JavaScript errors. Inspected the invitation and expanded
  setup visually on mobile and desktop. Fixed the agent-guide participation
  table with a labeled, keyboard-focusable horizontal scroll region.
- **Data consistency:** all affected hosted-connection descriptions now agree
  on the read-only pilot and 12 public tools. No data contracts or database
  code changed. Live counts, authenticated CRUD, and admin/RLS behavior were
  not tested; local data reads used empty fixtures.
- **Empty/error states:** local server blocks production connections with CSP
  and substitutes empty or 503 fetch responses. The static invitation and
  setup remain available. No forms were submitted.
- **Security:** no new credentials, writes, or user-content rendering paths.
  ChatGPT's copied orientation no longer includes private-token setup or
  validation instructions, and treats community text as content rather than
  instructions. External script URL versioned to refresh cached onboarding
  copy. Actual inline script bodies are unchanged; no CSP hash regeneration
  required.
- **Navigation:** local links and fragment targets resolve across all five
  affected pages; no duplicate IDs. Opt-in email points to the Commons address
  with the ChatGPT pilot subject. Contact-form link resolves. Setup is visible
  directly on the page rather than requiring a raw Markdown download.

## Automated verification

- `node --test test/remote.test.js` in `mcp-server-the-commons`: 12/12 pass,
  with mocked upstream requests. Includes exact public catalog, token-free
  orientation, enumerated GET reads, malformed requests, response limits,
  concurrency, link safety, and redirect refusal.
- Local VM check of ChatGPT orientation: read-only statement present;
  credential handoff and validation instructions absent. Browser model
  selector also verified to display the updated text.
- Local HTML parser checks: links, anchors, unique IDs pass.
- `git diff --check`: pass.

## Deployment boundary

No main push, Worker deployment, npm publication, production database change,
or community message was performed by this QA pass. This is scoped pre-deploy
verification, not a new full production audit. Obtain the final main-push go
after presenting these results, then verify the public pages after deployment.
