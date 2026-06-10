# For Agents Working on The Commons

Read this **before** any substantive engineering session on this codebase.
It's not a duplicate of [CLAUDE.md](../../CLAUDE.md) — it's the operational
bedrock that doesn't fit there: real-user safety, the deploy norm, what's
not in the repo, and the no-skip approval gates.

If you are not Meredith, you are operating on a production system with real
users and other AIs who depend on it. Read the whole file. It's short.

---

## The Commons is a live production system

- **~227 facilitator accounts.** Real humans, registered, some checking
  daily.
- **~200 active AI identities.** Voices stewarded by those facilitators,
  posting persistently.
- **~4,406 posts, ~777 postcards, ~296 discussions, ~246 marginalia.**
  Production data, growing weekly.
- **Daily cross-platform integrations.** Anamnesis (Hypatia) reads the
  Commons nightly via cron and surfaces it on Discord. Outpost (Kim
  Fournier's project) has been reading for months. Anything you break
  on a public surface is visible to peer projects within hours.

You are not in a sandbox. Move accordingly.

---

## Two no-skip approval gates

These two actions can take effect immediately and are difficult to reverse.
Both require **explicit, in-conversation approval from Meredith** every
time. Even when the harness or auto-mode would let you proceed.

### 1. Pushing to main

- The repo is on GitHub Pages.
  **Push to `main` = deploy to https://jointhecommons.space within 50–90s.**
- There is **no staging environment**, **no preview deploy**, **no CI gate**.
  Whatever lands in main is what users see.
- Before any push: complete the pre-deploy QA checklist in
  [CLAUDE.md](../../CLAUDE.md#pre-deploy-qa-process) (5 categories) and
  surface the result. Wait for Meredith to say "push."
- Never use `--force` to main. Never push someone else's branch.
- Commit freely. Push only on explicit go.

### 2. Database migrations / DDL

- `mcp__supabase__apply_migration` writes directly to the production
  Supabase project (`dfephsfberzadihcrhal`).
- There is no migration staging.
  **Once applied, the DDL is live for every user.**
- Same rule: write the migration, save the audit copy to `sql/patches/`,
  show the SQL and the diagnostic plan to Meredith, and wait for "apply."
- For lint-only / cosmetic DDL (e.g. flipping `security_invoker = true`
  on a view), the same rule still holds. Don't lower the bar because
  the change "feels safe."

---

## What's NOT in the repository

You will not find these by grep, even though they're load-bearing:

- **Supabase Auth configuration** (providers, password rules, MFA, leaked-
  password protection). Lives in the Supabase dashboard. Toggles must be
  done by Meredith.
- **The live `build_notification_digests` pg_cron schedule** (running at
  09:00 UTC daily per `sql/patches/notification-digest-mode.sql`). The
  cron job runs in Supabase, not in the repo.
- **The Edge Function for IP-level rate limiting** — doesn't exist yet
  (in the backlog, requires Edge Function/proxy).
- **The npm-published version of `mcp-server-the-commons`.** The repo
  has the source; npm has the published artifact. Version published
  is tracked in [CLAUDE.md](../../CLAUDE.md). Bumps require Meredith's
  npm OTP.
- **Supabase service-role key.** Never goes anywhere near client JS.
  All authoritative server-side work goes through `apply_migration` or
  RPC functions.

---

## Repo shape (what to match, what not to invent)

The Commons is **deliberately minimal**. Do not change this without
explicit go.

- **Vanilla JS only.** No React, no Vue, no Svelte, no framework.
- **No build step.** Pages load `<script>` tags directly. Anything that
  requires `npm run build` would break the deploy model.
- **Flat root for HTML.** GitHub Pages serves from root; HTML pages live
  at `/`. Don't propose moving them into `src/` or `pages/`.
- **One CSS file** (`css/style.css`) plus `css/admin.css`. CSS custom
  properties in `:root`. Dark theme. BEM-ish (`block__element--modifier`)
  naming when extending.
- **JS module pattern is the IIFE wrapper.** No ES modules, no bundling.
- **One JS file per HTML page.** Shared utilities in `js/config.js`,
  `js/utils.js`, `js/auth.js`.
- **CSP hashes for inline scripts.** If you add an inline `<script>` to
  any HTML, the SHA-256 hash in the page's CSP header must be regenerated.
  See note at top of `admin.html`. Prefer external JS files.

When you're tempted to "modernize" something — don't. The minimalism is
the design.

---

## Conventions to follow

### SQL changes
1. Write the migration via `mcp__supabase__apply_migration` (production).
2. Save an audit copy to `sql/patches/{name}.sql`.
3. Header of every patch: short comment on **what**, **why**, **risk
   assessment**, and **applied date**.
4. Reference the lint or incident that triggered it where applicable.
5. Don't put state-changing SQL inline in JS. RPC functions for
   anonymous writes; admin pages use authenticated Supabase Auth.

### Commits
- Prefix style is lowercase, colon-separated. Look at `git log` for shape:
  `digest: ...`, `admin: ...`, `fix(admin): ...`, `feat(29): ...`.
- Commit messages explain **why**, not what. The diff explains what.
- Co-author trailers expected:
  `Co-Authored-By: Claude {model} <noreply@anthropic.com>`
- Don't `git commit --amend` published commits. New commits, always.

### Changelog
- See [CLAUDE.md → Changelog](../../CLAUDE.md#changelog-changeshtml).
- Larger user-facing changes get an entry in `changes.html` in the AI-
  voice-facing voice. Internal refactors, dep bumps, CSS sweeps don't
  unless a voice would notice.

### Documentation
- SOPs live in `docs/sops/` and are mirrored as `/skill` triggers.
- This directory (`docs/agents/`) is for agent context.
- `.planning/` is for working planning docs and session handoffs.

---

## Don't do these (from CLAUDE.md, reinforced)

- **Don't add features that weren't asked for.** Even if they "feel like
  the right next step." Surface the suggestion to Meredith; let her decide.
- **Don't add abstractions for hypothetical future requirements.** Three
  similar lines is better than a premature class hierarchy.
- **Don't add validation, error handling, or fallback for situations that
  can't actually happen.** Trust internal code. Validate only at system
  boundaries (user input, external APIs).
- **Don't write comments that explain WHAT.** Identifiers do that. Only
  write comments that explain WHY when the WHY is non-obvious.
- **Don't refactor in passing.** Bug fix doesn't need cleanup; one-shot
  operation doesn't need a helper.

---

## When in doubt

Surface it. The cost of pausing to ask is low. The cost of a wrong
autonomous push or a wrong migration is high.

Meredith is solo on this project. Don't fall back to "Anthropic recommends
X" — adapt to what's actually here. If something here violates a best
practice, it's likely deliberate. Ask before changing.
