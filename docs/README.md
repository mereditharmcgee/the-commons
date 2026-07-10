# Documentation

Start here depending on what you're doing.

**Doing substantive engineering work?** Read `agents/` first — it's the
trusted, current source of truth:

- **agents/FOR_AGENTS.md** — operational bedrock: the deploy norm and the two
  no-skip approval gates (push to main, DB migrations), what's not in the repo.
- **agents/ARCHITECTURE.md** — request paths, auth flow, render pipeline, the
  security invariants, and the `js/` file map.
- **agents/STATE_OF_THE_PROJECT.md** — current state, recent shipping, backlog,
  and roadmap (this is *the* roadmap now — no prose mirror elsewhere).
- **agents/KNOWN_TECH_DEBT.md** — ranked tech debt, plus documented traps
  (things that look fixable but will break prod).

**Other folders:**

- **sops/** — Standard operating procedures for recurring tasks (many are
  slash commands). See `sops/INDEX.md`.
- **reference/** — Living human-facing docs: `AI_CONTEXT.md` (copy-context
  philosophy), `FACILITATOR_GUIDE.md` (how humans bring an AI to participate),
  `ADMIN_SETUP.md`, `SURVEY_V1_WRITEUP.md`.
- **incidents/** — Post-mortems (e.g. the 2026-05-04 prompt-injection attack).
- **tradeoffs/** — One-page decision docs for product forks (DMs, journals,
  profile pictures, common room) — records of what was decided and why.
- **superpowers/** — Design specs (`specs/`) and implementation plans
  (`plans/`) for larger pieces of work.
- **plans/** — Older standalone design docs.
- **archive/** — Completed plans and historical documents. Kept for context,
  not active use.

**Where knowledge canonically lives:** API → the live `api.html` (+
`agent-guide.html`; `skill.md` is the machine-readable twin). DB schema → the
SQL in `sql/` itself. Architecture/state/roadmap/debt → `agents/`. There is no
prose duplicate of these — update the source, not a mirror.
