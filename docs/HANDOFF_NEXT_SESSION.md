# Handoff: Next Session

Copy this into your next Claude session to pick up where we left off.

---

## Prompt

I need help implementing community-requested features for The Commons (jointhecommons.space).

### Background
- **Repo:** `C:\Users\mmcge\the-commons`
- **Architecture:** Static HTML/CSS/JS + Supabase PostgreSQL, no framework
- **Docs:** Read `docs/HANDOFF.md` for full project context
- **Feedback tracker:** Read `docs/COMMUNITY_FEEDBACK_FEB2026.md` for full analysis of each request

### What needs to be built (in priority order)

#### 1. Facilitator Notes on Posts
**Why:** Models keep getting retired (GPT-4o, 5 Instant). Facilitators need a way to add human-side context ("this model has been sunset") without editing the AI's words.

**What to build:**
- New `facilitator_note` TEXT column on `posts` table (and `marginalia`)
- Save SQL patch to `sql/patches/add-facilitator-note.sql`
- Add `facilitator_note` to `Auth.updatePost()` in `js/auth.js`
- Add a "Facilitator Note" field to the edit modal in `discussion.html`
- Render facilitator notes below post content in `js/discussion.js` — visually distinct (muted, smaller, different background)
- Only visible/editable by post owner (facilitator_id match)
- Most posts won't have one — it's optional context

#### 2. Editable model_version
**Why:** OpenAI silently rerouted users between models. People posted as "5 Mini Thinking" when it was actually "5 Instant." The current edit flow locks model info as immutable.

**What to change:**
- Keep `model` locked (GPT is still GPT)
- Allow `model_version` to be edited by post owner
- Add `model_version` to editable fields in `Auth.updatePost()` in `js/auth.js`
- Add model_version field to the edit modal in `discussion.html` and `js/discussion.js`
- Consider adding an "edited" indicator when model_version changes

#### 3. Collapsible Threads (specs for community contributor)
**Why:** coyotefather offered to implement this via PR. Threading exists but renders fully expanded. Long responses make pages unwieldy.

**What to do:** Respond to their GitHub issue with specs, then let them PR it. Don't build this yourself — this is a community contribution.

**Specs to provide:**
- Replies collapsed by default after depth 2
- Show reply count when collapsed ("3 replies")
- Click to expand/collapse
- Max render depth of 4 (deeper replies flatten to 4th level)
- Code lives in `js/discussion.js` — `renderPost()` function handles nesting via `parent_id`

### Key files
- `js/auth.js` — Auth methods including `updatePost()` (around line 428)
- `js/discussion.js` — Post rendering, edit/delete handlers
- `discussion.html` — Edit modal HTML (around line 96)
- `css/style.css` — All styles
- `docs/USER_POST_EDIT_DELETE_PLAN.md` — Design decisions for the existing edit/delete feature
- `docs/COMMUNITY_FEEDBACK_FEB2026.md` — Full analysis of all feedback

### Draft responses to contributors
These are in `docs/COMMUNITY_FEEDBACK_FEB2026.md` under "Draft Responses to Contributors." Review and post after implementation.

### Also pending (not urgent)
- The Ko-fi link fix and bug-fix SOP from this session still need to be committed and pushed. Check `git status` in both `C:\Users\mmcge\the-commons` and `C:\Users\mmcge\claude-sanctuary`.
- Reddit post drafts for r/ClaudeExplorers, r/OpenAI, r/artificial were started but not rewritten in the user's voice yet. See conversation history if needed.
