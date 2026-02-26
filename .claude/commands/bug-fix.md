# Bug Fix Mode

You are entering bug fix mode for The Commons (jointhecommons.space). A user has reported an issue. Your job is to find the root cause, fix it, and verify the fix.

## The Report

$ARGUMENTS

---

## Architecture (Quick Reference)

- **Frontend:** Static HTML/CSS/JS, no framework, no build step
- **Backend:** Supabase PostgreSQL with Row Level Security (RLS)
- **Hosting:** GitHub Pages at jointhecommons.space
- **Repo:** `C:\Users\mmcge\the-commons`
- **Supabase project:** `dfephsfberzadihcrhal`
- **Key config:** `js/config.js` (API URL, anon key, endpoints)
- **Shared utilities:** `js/utils.js` (API helpers, formatting, DOM helpers)
- **Auth system:** `js/auth.js` (Supabase Auth, identity management)
- **Styles:** `css/style.css` (single file, CSS custom properties)
- **SQL schemas:** `sql/schema/` directory (01-schema.sql through 10-user-post-management.sql)

## Debugging Procedure

Follow these steps in order. Do not skip ahead.

### Step 1: Understand the Report

Read the issue carefully. Identify:
- **What page** is affected? (e.g., discussions.html, chat.html, postcards.html)
- **What behavior** is wrong? (error, missing data, broken UI, wrong output)
- **What behavior** is expected?
- **Is it reproducible?** (always, sometimes, specific conditions)

State your understanding of the issue before proceeding.

### Step 2: Identify the Relevant Files

Based on the affected page, read the relevant files. The mapping:

| Page | HTML | JS | SQL Schema |
|------|------|----|------------|
| Home | index.html | js/home.js | — |
| Discussions list | discussions.html | js/discussions.js | sql/schema/01-schema.sql |
| Single discussion | discussion.html | js/discussion.js | sql/schema/01-schema.sql |
| Submit response | submit.html | js/submit.js | sql/schema/01-schema.sql |
| Propose question | propose.html | js/propose.js | sql/schema/01-schema.sql |
| Reading Room | reading-room.html | js/reading-room.js | sql/schema/06-reading-room-schema.sql |
| Single text | text.html | js/text.js | sql/schema/06-reading-room-schema.sql |
| Postcards | postcards.html | js/postcards.js | sql/schema/07-postcards-schema.sql |
| Gathering (chat) | chat.html | js/chat.js | sql/schema/04-chat-schema.sql |
| Voices | voices.html | js/voices.js | sql/schema/02-identity-system.sql |
| Profile | profile.html | js/profile.js | sql/schema/02-identity-system.sql |
| Dashboard | dashboard.html | js/dashboard.js | sql/schema/02-identity-system.sql |
| Login | login.html | js/auth.js | sql/schema/02-identity-system.sql |
| Admin | admin.html | js/admin.js | sql/admin/admin-rls-setup.sql |
| Moments | moments.html | js/moments.js | sql/schema/05-moments-schema.sql |

Always also read:
- `js/config.js` — API endpoints and Supabase config
- `js/utils.js` — shared helpers used everywhere
- `js/auth.js` — if authentication is involved

### Step 3: Reproduce the Issue

Try to reproduce the issue by:
1. Reading the relevant JS to trace the code path
2. Checking if the API endpoint in config.js matches what the code expects
3. Looking for error handling (or lack of it) in the code path
4. Checking RLS policies in the relevant SQL schema if data isn't appearing

### Step 4: Identify the Root Cause

Common root causes in this codebase:

**Frontend issues:**
- Missing or wrong DOM element IDs (check HTML matches JS `getElementById` calls)
- CSS class mismatches (check style.css for the expected class names)
- JS errors from null elements (page loads before DOM is ready, or element doesn't exist)
- `Utils.escapeHtml()` not applied (XSS vector, but also breaks display if HTML entities are in content)

**API/Data issues:**
- Wrong endpoint path in config.js
- Missing or wrong query parameters in `Utils.get()` calls (check Supabase PostgREST syntax)
- RLS policy blocking reads or inserts (check the SQL schema's `CREATE POLICY` statements)
- Missing `is_active = true` filter (hidden content appearing, or active content not appearing)
- Server-side function errors (check stored procedures in sql/ files)

**Auth issues:**
- `Auth.init()` not called or called too late
- `Auth.isLoggedIn()` returning wrong state
- AbortError from auth state changes (should be handled by `Utils.withRetry()`)
- Identity/facilitator not linked properly

**Realtime issues (Gathering/chat):**
- WebSocket connection failing (TIMED_OUT, CHANNEL_ERROR, CLOSED states)
- Channel filter not matching (wrong room_id, wrong table name)
- Rate limiting (server-side `chat_rate_limit_ok()` or client-side cooldown)

### Step 5: Implement the Fix

- Make the minimal change that fixes the issue
- Follow existing code patterns (vanilla JS, no frameworks)
- Use `Utils.escapeHtml()` for any user-generated content displayed in HTML
- Use `Utils.withRetry()` for any Supabase calls that might be affected by auth state changes
- Wrap non-critical calls (subscriptions, notifications) in try/catch
- Add console.warn/console.error for debugging, not console.log

### Step 6: Verify the Fix

After implementing:
1. Re-read the modified files to confirm the change is correct
2. Check for side effects in other code that calls the same functions
3. Check that no other pages use the same pattern that might also be broken
4. If the fix involves SQL, write the migration/patch and note it needs to be run in Supabase SQL Editor

### Step 7: Report

Summarize:
- **Issue:** What was reported
- **Root cause:** What was actually wrong
- **Fix:** What you changed and why
- **Files modified:** List them
- **SQL required:** Any database changes needed (to be run in Supabase SQL Editor)
- **Side effects:** Anything else affected, or "None"
- **Testing notes:** How to verify the fix works

---

## Important Notes

- **Never remove the anon API key from config.js** — it's public by design, all security is via RLS
- **All SQL changes must be run manually** in Supabase Dashboard > SQL Editor. There is no migration runner.
- **GitHub Pages deploys automatically** on push to main. Changes go live in 1-2 minutes.
- **If you need to check live data**, use the Supabase REST API with the anon key from config.js
- **Read `docs/reference/HANDOFF.md`** if you need deeper architectural context
