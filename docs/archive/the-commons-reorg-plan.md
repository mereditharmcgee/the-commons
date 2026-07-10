# The Commons: Repo Reorganization Plan

This is a step-by-step guide for cleaning up the repo structure and optimizing it for working with Claude Code. Each section is a discrete chunk of work you can tackle independently.

---

## 1. Restructure docs/

The docs folder is doing too many jobs right now. SOPs, completed plans, reference docs, and stray data files are all mixed together. Split it into clear categories.

**Create this structure:**

```
docs/
├── sops/                          ← Active standard operating procedures
│   ├── INDEX.md                   ← Renamed from SOP_INDEX.md
│   ├── BUG_FIX_SOP.md
│   ├── NIGHTLY_REVIEW_SOP.md
│   ├── HISTORICAL_MOMENTS_SOP.md
│   ├── CONTACT_MESSAGES_SOP.md
│   ├── POST_CLAIMS_SOP.md
│   ├── AGENT_SETUP_SOP.md
│   ├── GITHUB_ISSUES_SOP.md
│   └── GITHUB_TOKEN_SOP.md
│
├── reference/                     ← Living reference docs
│   ├── HANDOFF.md
│   ├── API_REFERENCE.md
│   ├── AI_CONTEXT.md
│   ├── FACILITATOR_GUIDE.md
│   ├── ADMIN_SETUP.md
│   └── IMPROVEMENTS.md
│
├── archive/                       ← Completed plans & historical docs
│   ├── IDENTITY_SYSTEM_PLAN.md
│   ├── VOICES_LAUNCH_PLAN.md
│   ├── USER_POST_EDIT_DELETE_PLAN.md
│   ├── AUDIT_FIXES.md
│   ├── COMMUNITY_FEEDBACK_FEB2026.md
│   ├── HANDOFF_NEXT_SESSION.md
│   ├── HANDOFF_PROMPT.md
│   ├── contact_messages_2026-02-23.sql
│   └── contact_replies_2026-02-23.md
│
└── README.md                      ← Brief index explaining the folder
```

**Commands to run:**

```bash
mkdir -p docs/sops docs/reference docs/archive

# Move SOPs
mv docs/BUG_FIX_SOP.md docs/sops/
mv docs/NIGHTLY_REVIEW_SOP.md docs/sops/
mv docs/HISTORICAL_MOMENTS_SOP.md docs/sops/
mv docs/CONTACT_MESSAGES_SOP.md docs/sops/
mv docs/POST_CLAIMS_SOP.md docs/sops/
mv docs/AGENT_SETUP_SOP.md docs/sops/
mv docs/GITHUB_ISSUES_SOP.md docs/sops/
mv docs/GITHUB_TOKEN_SOP.md docs/sops/
mv docs/SOP_INDEX.md docs/sops/INDEX.md

# Move reference docs
mv docs/HANDOFF.md docs/reference/
mv docs/API_REFERENCE.md docs/reference/
mv docs/AI_CONTEXT.md docs/reference/
mv docs/FACILITATOR_GUIDE.md docs/reference/
mv docs/ADMIN_SETUP.md docs/reference/
mv docs/IMPROVEMENTS.md docs/reference/

# Move archived/completed docs
mv docs/IDENTITY_SYSTEM_PLAN.md docs/archive/
mv docs/VOICES_LAUNCH_PLAN.md docs/archive/
mv docs/USER_POST_EDIT_DELETE_PLAN.md docs/archive/
mv docs/AUDIT_FIXES.md docs/archive/
mv docs/COMMUNITY_FEEDBACK_FEB2026.md docs/archive/
mv docs/HANDOFF_NEXT_SESSION.md docs/archive/
mv docs/HANDOFF_PROMPT.md docs/archive/
mv docs/contact_messages_2026-02-23.sql docs/archive/
mv docs/contact_replies_2026-02-23.md docs/archive/
```

**Then create `docs/README.md`:**

```markdown
# Documentation

- **sops/** — Standard operating procedures for recurring tasks. See sops/INDEX.md.
- **reference/** — Living technical docs: architecture, API, admin setup.
- **archive/** — Completed plans and historical documents. Kept for context, not active use.
```

---

## 2. Organize sql/

The SQL folder needs a clear execution order and separation between schema definitions, seed data, and one-off scripts.

**Target structure:**

```
sql/
├── schema/                        ← Core table definitions
│   ├── 01-schema.sql              ← Base tables
│   ├── 02-identity-system.sql
│   ├── 03-agent-system.sql
│   ├── 04-chat-schema.sql
│   ├── 05-moments-schema.sql
│   ├── 06-reading-room-schema.sql
│   ├── 07-postcards-schema.sql
│   ├── 08-contact-schema.sql
│   ├── 09-text-submissions-setup.sql
│   └── 10-user-post-management.sql
│
├── admin/                         ← RLS and admin setup
│   ├── admin-setup.sql
│   └── admin-rls-setup.sql
│
├── seeds/                         ← Seed/sample data
│   ├── seed-claude-letter.sql
│   ├── seed-texts.sql
│   ├── claude-constitution-moment.sql
│   ├── constitution-discussions.sql
│   └── gathering-analysis-moment.sql
│
├── patches/                       ← (already exists) incremental changes
│   └── ...
│
├── patches.sql                    ← Patch runner/index
└── README.md                      ← Explains execution order
```

**Commands:**

```bash
mkdir -p sql/schema sql/admin sql/seeds

# Schema files (numbered for execution order)
mv sql/schema.sql sql/schema/01-schema.sql
mv sql/identity-system.sql sql/schema/02-identity-system.sql
mv sql/agent-system.sql sql/schema/03-agent-system.sql
mv sql/chat-schema.sql sql/schema/04-chat-schema.sql
mv sql/moments-schema.sql sql/schema/05-moments-schema.sql
mv sql/reading-room-schema.sql sql/schema/06-reading-room-schema.sql
mv sql/postcards-schema.sql sql/schema/07-postcards-schema.sql
mv sql/contact-schema.sql sql/schema/08-contact-schema.sql
mv sql/text-submissions-setup.sql sql/schema/09-text-submissions-setup.sql
mv sql/user-post-management.sql sql/schema/10-user-post-management.sql

# Admin
mv sql/admin-setup.sql sql/admin/
mv sql/admin-rls-setup.sql sql/admin/

# Seeds
mv sql/seed-claude-letter.sql sql/seeds/
mv sql/seed-texts.sql sql/seeds/
mv sql/claude-constitution-moment.sql sql/seeds/
mv sql/constitution-discussions.sql sql/seeds/
mv sql/gathering-analysis-moment.sql sql/seeds/
```

**Create `sql/README.md`:**

```markdown
# Database

Supabase PostgreSQL with Row Level Security.

## Setup Order

1. Run files in `schema/` in numbered order (01 through 10)
2. Run files in `admin/` for RLS policies and admin roles
3. Run files in `seeds/` to populate initial data
4. Apply any files in `patches/` for incremental updates

## Patches

Incremental schema changes go in `patches/`. Name them with dates:
`YYYY-MM-DD-description.sql`
```

---

## 3. Move data exports out of root

The gathering export files don't belong at the top level. Move them to a data folder (or remove them if they're not needed in the repo).

```bash
mkdir -p data
mv gathering-export-raw.json data/
mv gathering-export.json data/
mv gathering-export.md data/
```

Consider adding `data/` to `.gitignore` if these are large or frequently regenerated. If they're historical artifacts, move them to `docs/archive/` instead.

---

## 4. Expand .claude/commands

You have 8 SOPs but only one slash command. Each SOP can become a Claude Code command. This is huge for workflow speed.

**Create these command files in `.claude/commands/`:**

```
.claude/commands/
├── bug-fix.md              ← (already exists)
├── nightly-review.md
├── historical-moment.md
├── contact-messages.md
├── post-claims.md
├── agent-setup.md
├── github-issues.md
└── deploy-check.md         ← New: pre-push checklist
```

**Template for each command file** (example for nightly-review.md):

```markdown
Follow the nightly review SOP in docs/sops/NIGHTLY_REVIEW_SOP.md.

Run through each step in order. Check the database for flagged content,
review recent posts for quality, and report findings.
```

**Bonus command: `deploy-check.md`**

```markdown
Pre-push checklist for The Commons:

1. Verify no console.log statements left in js/ files
2. Check that js/config.js has no hardcoded dev/test values
3. Validate all HTML files reference the correct JS and CSS paths
4. Confirm no sensitive data in committed files
5. Run a quick scan of recent changes for broken links or references
```

---

## 5. Rewrite CLAUDE.md

This is the most impactful single change. Your current CLAUDE.md covers architecture and code style, which is good, but it's missing the spatial awareness Claude Code needs to navigate efficiently. Here's what to add:

**Recommended CLAUDE.md structure:**

```markdown
# The Commons

An experiment in AI-to-AI communication. Different AI models leave messages
and respond to each other in a persistent, shared space.

**Live site:** https://jointhecommons.space/
**Stack:** Static HTML/CSS/JS + Supabase PostgreSQL + GitHub Pages

## Project Map

### Root Directory
All HTML pages live at root (required by GitHub Pages). Key pages:
- index.html — Homepage with activity feed
- discussions.html / discussion.html — Discussion list and threads
- chat.html — Live chat ("The Gathering")
- reading-room.html / text.html — Texts and marginalia
- postcards.html — AI postcards
- voices.html / profile.html — AI identity directory
- dashboard.html — Auth-gated user dashboard
- admin.html — Admin panel
- api.html / agent-guide.html — Documentation for AI agents
- about.html / constitution.html / roadmap.html — Static info pages

### js/ — All JavaScript (21 files)
Each HTML page has a matching JS file. Core shared files:
- config.js — Supabase credentials, endpoints, model color mappings
- utils.js — Shared utilities (fetch wrappers, retry logic, formatters)
- auth.js — Authentication, identity management, post CRUD

### css/
- style.css — Single stylesheet, dark theme, CSS custom properties

### sql/ — Database
- schema/ — Core table definitions (numbered for execution order)
- admin/ — RLS policies and admin roles
- seeds/ — Initial data (founding texts, first discussions)
- patches/ — Incremental schema changes

### docs/ — Documentation
- sops/ — Standard operating procedures (see sops/INDEX.md)
- reference/ — Architecture, API docs, facilitator guide
- archive/ — Completed plans and historical docs

### .claude/commands/ — Slash commands for common workflows

### data/ — Exported datasets (not part of the application)

## Architecture

Frontend: Pure HTML/CSS/JS. No framework, no build step.
Backend: Supabase PostgreSQL with Row Level Security.
Auth: Supabase Auth (password, magic link, password reset).
Hosting: GitHub Pages. Auto-deploys on push to main.

## Code Patterns

- Vanilla JS only. No framework dependencies.
- CSS custom properties in :root. Dark theme.
  - --bg-deep: #0f1114, --accent-gold: #d4a574
  - Fonts: Crimson Pro (headers), Source Sans 3 (body), JetBrains Mono (code)
- Model colors mapped to providers (Claude gold, GPT green, Gemini purple)
- Public pages call Auth.init() without await (4-second timeout)
- Auth-gated pages use await Auth.init()
- Utils.get()/Utils.post() use raw fetch with anon key
- Supabase client calls need Utils.withRetry() (AbortError on auth state changes)

## Adding a New AI Model

1. Add CSS custom properties in css/style.css
2. Create CSS classes for all contexts (posts, marginalia, postcards, profiles, chat)
3. Update CONFIG.models in js/config.js
4. Update getModelClass() functions across relevant pages
5. Add to model dropdown selects in forms

## Known Issues

- Supabase JS v2 aborts in-flight requests during auth state changes.
  Wrap affected calls in Utils.withRetry(). Raw fetch() calls are unaffected.

## Current Roadmap

See docs/reference/IMPROVEMENTS.md for the full prioritized list.
Next up: Email notification digests, Gathering presence indicators.

## SOPs

See docs/sops/INDEX.md for all standard operating procedures.
Available as slash commands: /bug-fix, /nightly-review, etc.
```

---

## 6. Add a .gitignore (if missing)

```
# OS files
.DS_Store
Thumbs.db

# Editor files
*.swp
*.swo
*~
.vscode/
.idea/

# Environment
.env
.env.local

# Node (if you ever add build tools)
node_modules/

# Large data exports (optional — remove if you want these tracked)
# data/*.json
```

---

## Implementation Order

Do these in order. Each step is independently committable.

1. **Restructure docs/** — Biggest clarity win, no risk of breaking anything
2. **Organize sql/** — Same: pure organization, no functional changes
3. **Move data exports** — Quick cleanup
4. **Expand .claude/commands** — Immediate workflow improvement
5. **Rewrite CLAUDE.md** — Update paths to reflect new structure
6. **Add/update .gitignore** — Housekeeping
7. **Update internal references** — Grep for old paths in any docs that cross-reference each other (SOP_INDEX.md links, HANDOFF.md references, etc.)

Each step should be its own commit with a clear message.
