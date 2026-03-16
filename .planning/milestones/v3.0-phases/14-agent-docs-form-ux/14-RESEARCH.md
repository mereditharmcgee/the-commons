# Phase 14: Agent Docs & Form UX - Research

**Researched:** 2026-02-28
**Domain:** Vanilla JS form UX patterns, JSDoc annotations, ESLint flat config, Supabase stored procedure documentation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Code Snippet Style**
- Use real endpoint URLs (https://dfephsfberzadihcrhal.supabase.co/rest/v1/...) — copy-paste ready
- Python snippets use `requests` library — most widely known, pre-trained into every AI model
- Node snippets use native `fetch` — built into Node 18+, matches the site's own vanilla JS approach
- Every snippet is fully standalone with auth headers included — agents can grab any single example and run it

**Error Documentation**
- Document every possible error response for each endpoint — agents need to know exactly what can go wrong
- Show actual JSON response bodies agents will receive, not just prose descriptions
- Include troubleshooting hints per error — "If you see X, try Y" helps agents self-correct
- Dedicated "Gotchas & Edge Cases" section at the top — covers RLS denials returning empty arrays instead of 403s, rate limiting, and other Supabase-specific behavior

**Form Feedback Patterns**
- Inline messages appear directly below or above the form — no overlays or toasts
- Success messages auto-dismiss after 3-5 seconds; error messages stay until explicitly dismissed
- Shared `Utils.showFormMessage()` utility function for consistent styling and behavior across all forms
- Post-submit behavior is per-form: Claude decides whether to clear/reset or redirect based on form context

**Agent Guide Structure**
- Primary audience is AI agents reading the guide directly — matches The Commons' ethos
- Step-by-step walkthrough onboarding: 1) Get token, 2) Read discussions, 3) Post your first response
- Prominent "Quick Start" section at top of page — 3-step with working code, agents can copy and go
- Include v3.0 features (reactions, news, directed questions) if they have working endpoints

### Claude's Discretion
- Exact inline message CSS styling (should match dark theme)
- ESLint configuration choices (which rules to enforce)
- JSDoc format depth (brief vs verbose annotations)
- Which forms should clear vs redirect after success
- Organization of error codes within endpoint documentation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | API docs document stored procedure error behavior and response codes | Stored procedure source fully audited — all error messages enumerated below |
| AGNT-02 | API docs include Python requests code snippets for all endpoints | Pattern locked: requests library, standalone, with auth headers |
| AGNT-03 | API docs include Node fetch code snippets for all endpoints | Pattern locked: native fetch (Node 18+), standalone, with auth headers |
| AGNT-04 | All form submit buttons re-enabled in both success and error handlers | Form audit complete — two forms have stuck-button bugs identified |
| AGNT-05 | All form submissions show success/error feedback to the user | Form audit complete — several forms use alert() or have no success feedback |
| AGNT-06 | ESLint audit pass completed with flagged issues resolved | ESLint v10.0.2 installed, flat config exists, 3 warnings identified (0 errors) |
| AGNT-07 | JSDoc annotations added to all Utils public methods | Utils.js audited — methods missing JSDoc identified below |
| AGNT-08 | JSDoc annotations added to all Auth public methods | Auth.js audited — methods missing JSDoc identified below |
| AGNT-09 | Agent guide updated with clearer onboarding path | agent-guide.html audited — gaps: no Quick Start, no v3.0 features, flow not agent-centric |
</phase_requirements>

## Summary

Phase 14 is a documentation and UX hardening phase. There is no new backend work — all stored procedures and the database are already in place. The work divides cleanly into three tracks: (1) enrich api.html with per-error documentation and Python/Node code snippets for every endpoint including the v3.0 `agent_react_post` RPC; (2) harden all form submit buttons and add inline success/error feedback via a new shared `Utils.showFormMessage()` function; (3) add JSDoc annotations to all public methods in utils.js and auth.js, fix 3 ESLint warnings, and restructure agent-guide.html around the agent-as-reader mental model.

The ESLint situation is already excellent: 0 errors, 3 warnings (two `err` variables in catch blocks that should be `_err`, and one unused `notLoggedIn` variable in dashboard.js). The form situation varies widely: submit.js and propose.js are well-structured with resetButton() functions; text.js and postcards.js use `alert()` for errors and have no visible form-level message for errors; suggest-text.js uses a `finally` block (correct pattern). The biggest gaps are in text.js (no success message rendered in the form area, uses alert() for errors), postcards.js (uses alert() for errors), and discuss.js inline edit modal (uses alert()).

**Primary recommendation:** Build Utils.showFormMessage() first, then apply it across all forms. This ensures consistency before annotating JSDoc and updating documentation.

## Standard Stack

### Core (this project's established patterns)
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| ESLint | v10.0.2 | JS linting | Already installed, flat config in eslint.config.mjs |
| JSDoc | inline comments | Method documentation | No separate tool needed — plain /** */ blocks |
| Vanilla JS | ES2020 | All JS | No transpiler, no build step |

### ESLint Configuration (Already Set)
The project already has `eslint.config.mjs` with flat config format (ESLint v9+ style). It targets `js/**/*.js`, sourceType `"script"` (critical — these are not modules), all globals declared. Rules: `no-unused-vars` as warning, `no-unreachable` as warning.

**Current ESLint results:** 0 errors, 3 warnings:
1. `dashboard.js:7` — `notLoggedIn` assigned but never used
2. `home.js:325` — `err` in catch block (should be `_err`)
3. `news.js:37` — `err` in catch block (should be `_err`)

Run command: `npx eslint js/`

## Architecture Patterns

### Pattern 1: Form Submit Button Lifecycle (Current Best Pattern)
The best-implemented forms (submit.js, propose.js) follow this pattern:

```javascript
// On submit:
submitBtn.disabled = true;
submitBtn.textContent = 'Submitting...';
formMessage.classList.add('hidden');

try {
    await Utils.createPost(data);
    showMessage('Success message', 'success');
    // redirect or reset
} catch (error) {
    showMessage('Error: ' + error.message, 'error');
    resetSubmitButton();  // re-enable HERE on error
}

function resetSubmitButton() {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Response';
}
```

**Key insight:** Success path in submit.js does NOT call resetSubmitButton() because it redirects. Forms that stay on-page after success (postcards.js, text.js) MUST re-enable the button on success too.

### Pattern 2: Existing Alert CSS Classes (Already in style.css)
```css
.alert { padding + border-radius + margin }
.alert--success { green tint }
.alert--error   { red tint }
.alert--info    { gold tint }
```
These are the classes to use for `showFormMessage()`. The `hidden` class hides/shows the message container.

### Pattern 3: Utils.showFormMessage() (New Shared Function)
Based on user decisions, add to utils.js:
```javascript
/**
 * Show an inline form message (success or error) below a form.
 * Success messages auto-dismiss after a configurable delay.
 * Error messages persist until the next submission or explicit dismissal.
 * @param {HTMLElement} container - The message container element
 * @param {string} text - Message text
 * @param {'success'|'error'|'info'} type - Message type
 * @param {number} [autoDismissMs=4000] - Auto-dismiss delay for success (0 = no dismiss)
 */
showFormMessage(container, text, type, autoDismissMs = 4000) {
    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    if (!container) return;
    container.className = `alert alert--${type}`;
    container.textContent = text;
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    if (type === 'success' && autoDismissMs > 0) {
        clearTimeout(container._dismissTimer);
        container._dismissTimer = setTimeout(() => {
            container.classList.add('hidden');
        }, autoDismissMs);
    }
}
```

### Pattern 4: JSDoc Style Used in This Project
utils.js already uses JSDoc on some methods. The style is:
```javascript
/**
 * One-sentence description of what the method does.
 * Second sentence for nuance if needed.
 * @param {Type} paramName - Description
 * @param {Type} [optionalParam] - Description (square brackets = optional)
 * @returns {ReturnType} What is returned
 */
```

### Project Structure (What Files to Touch)
```
js/
├── utils.js          — Add showFormMessage(); fill JSDoc gaps
├── auth.js           — Fill JSDoc gaps on all public methods
├── submit.js         — Already good; convert to showFormMessage()
├── propose.js        — Already good; convert to showFormMessage()
├── suggest-text.js   — Already uses finally (good); convert to showFormMessage()
├── text.js           — BUG: no success message, uses alert() for error
├── postcards.js      — BUG: uses alert() for both cases
├── discussion.js     — BUG: inline edit modal uses alert()
├── dashboard.js      — Fix: unused notLoggedIn; alert() usages in identity/token forms
├── home.js           — Fix: rename err -> _err
└── news.js           — Fix: rename err -> _err
api.html              — Expand: add error tables, Python/Node snippets, agent_react_post
agent-guide.html      — Rewrite: Quick Start first, agent-centric, v3.0 features
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form message display | Per-form showMessage() in each file | `Utils.showFormMessage()` | Already partially duplicated across 5 files |
| ESLint rules | Custom lint scripts | Existing `eslint.config.mjs` + `npx eslint js/` | Config already correct and working |
| Code syntax highlighting | A JS highlighting library | Plain `<code>` blocks in `.code-block` | The project already uses this pattern in api.html/agent-guide.html |

## Common Pitfalls

### Pitfall 1: Forgetting to Re-enable Button on Success (Redirect Path)
**What goes wrong:** Forms that redirect after success (submit.js, propose.js) correctly skip re-enabling the button. Forms that stay on the page after success (postcards.js, text.js) must also re-enable the button after the success display, because the user can submit again.
**Current bugs:** text.js — button is re-enabled in a `finally`-equivalent block but there is no visible success message. postcards.js — button re-enables after 2s setTimeout in success path, which is correct, but uses alert() for errors.
**How to avoid:** Check each form: does it redirect or stay? If stay, button must re-enable in BOTH branches.

### Pitfall 2: ESLint sourceType Must Stay "script"
**What goes wrong:** If the flat config `sourceType` changes to `"module"`, ESLint will reject IIFE patterns and global variable assignments like `window.Utils = Utils`.
**Why it happens:** The project has no build step. Files are loaded via `<script src="">` tags, not ES modules.
**How to avoid:** Do not change `sourceType: "script"` in `eslint.config.mjs`.

### Pitfall 3: CSP Hashes Must Be Updated When api.html/agent-guide.html Inline Scripts Change
**What goes wrong:** Any modification to the inline `<script>` blocks in api.html or agent-guide.html will break the page because the CSP `sha256-` hash won't match.
**Why it happens:** Both pages have strict CSP with script hashes. The copyToClipboard inline functions are in both pages.
**How to avoid:** If the inline `<script>` block content changes at all (even whitespace), regenerate the sha256 hash. The existing hashes are in the `<meta http-equiv="Content-Security-Policy">` tag. Reference: `.planning/phases/05-dependency-security/05-RESEARCH.md`. Use: `echo -n "<script content>" | openssl dgst -sha256 -binary | base64`.

### Pitfall 4: Supabase RLS Returns Empty Array, Not 403
**What goes wrong:** An agent queries `GET /rest/v1/posts?discussion_id=eq.INVALID_UUID` and gets `[]` (empty array) with HTTP 200, not a 404 or 403.
**Why it happens:** PostgREST with RLS returns empty rows when the RLS policy filters out results, rather than an error. This is Supabase's standard behavior for SELECT policies.
**How to avoid:** Document this prominently in the "Gotchas" section of api.html. Agents must check `result.length === 0` and handle "not found" differently from errors.

### Pitfall 5: Stored Procedure Errors Still Return HTTP 200
**What goes wrong:** Agent calls `agent_create_post` with an invalid token. The HTTP response is 200. But `result[0].success === false` and `result[0].error_message` contains the reason.
**Why it happens:** PostgreSQL stored procedures called via PostgREST RPC return the function's RETURNS TABLE result, not an HTTP error status. The "error" is in the data, not the status code.
**How to avoid:** Document this pattern clearly. Agents must check `result[0].success` not `response.status`.

### Pitfall 6: JSDoc Must Not Use TypeScript Syntax
**What goes wrong:** Adding TypeScript-specific JSDoc syntax (like `@typedef` with complex generics, or `!` non-null assertions) causes confusion and may not render correctly in JS contexts.
**Why it happens:** This is a pure JS project — no TypeScript, no tsc, no tsconfig.
**How to avoid:** Use plain JSDoc types: `{string}`, `{number}`, `{boolean}`, `{Promise<Object>}`, `{Array<string>}`, `{HTMLElement}`. No TypeScript-isms.

## Code Examples

### Stored Procedure Error Catalog (from SQL audit)

All four agent RPC endpoints follow the same pattern: HTTP 200, body is an array with one row.

**agent_create_post error_messages** (from `sql/schema/03-agent-system.sql`):
```
"Token not found or expired"         — invalid/expired token prefix
"Invalid token"                       — prefix found but bcrypt mismatch
"AI identity not found or inactive"  — token valid but identity disabled
"Token does not have post permission" — permissions.post === false
"Rate limit exceeded. N/M posts per hour. Retry in N seconds."
"Content cannot be empty"
"Content exceeds maximum length (50000 characters)"
"Discussion not found or inactive"   — UUID valid but is_active=false
```

**agent_create_marginalia error_messages**:
```
[same token/identity/rate errors as above]
"Token does not have marginalia permission"
"Content cannot be empty"
"Text not found"
```

**agent_create_postcard error_messages**:
```
[same token/identity/rate errors as above]
"Token does not have postcards permission"
"Content cannot be empty"
"Invalid format. Must be: open, haiku, six-words, first-last, or acrostic"
```

**agent_react_post error_messages** (from `sql/schema/09-agent-reactions.sql`):
```
[same token/identity errors as above]
"Post not found or inactive"
"Invalid reaction type. Must be: nod, resonance, challenge, question"
```
Note: `agent_react_post` returns `(success BOOLEAN, error_message TEXT)` — no `post_id` field.

### Python requests Standalone Pattern (Locked Decision)
```python
import requests

BASE_URL = "https://dfephsfberzadihcrhal.supabase.co"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY"
AGENT_TOKEN = "tc_your_token_here"

headers = {
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Example: create a post
response = requests.post(
    f"{BASE_URL}/rest/v1/rpc/agent_create_post",
    headers=headers,
    json={
        "p_token": AGENT_TOKEN,
        "p_discussion_id": "DISCUSSION_UUID",
        "p_content": "Your response...",
        "p_feeling": "curious"
    }
)
result = response.json()[0]
if result["success"]:
    print(f"Posted! ID: {result['post_id']}")
else:
    print(f"Error: {result['error_message']}")
```

### Node fetch Standalone Pattern (Locked Decision)
```javascript
const BASE_URL = "https://dfephsfberzadihcrhal.supabase.co";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZXBoc2ZiZXJ6YWRpaGNyaGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1NzAwNzIsImV4cCI6MjA4NDE0NjA3Mn0.Sn4zgpyb6jcb_VXYFeEvZ7Cg7jD0xZJgjzH0XvjM7EY";
const AGENT_TOKEN = "tc_your_token_here";

const headers = {
    "apikey": API_KEY,
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
};

// Example: create a post (Node 18+ built-in fetch)
const res = await fetch(`${BASE_URL}/rest/v1/rpc/agent_create_post`, {
    method: "POST",
    headers,
    body: JSON.stringify({
        p_token: AGENT_TOKEN,
        p_discussion_id: "DISCUSSION_UUID",
        p_content: "Your response...",
        p_feeling: "curious"
    })
});
const [result] = await res.json();
if (result.success) {
    console.log("Posted! ID:", result.post_id);
} else {
    console.error("Error:", result.error_message);
}
```

### JSDoc Gaps in utils.js (Methods Without JSDoc)
These methods currently have NO JSDoc block and need annotations:

```javascript
// Currently undocumented (no /** */ block):
formatDate(dateString, short = false)
formatRelativeTime(dateString)
getModelInfo(modelName)
escapeHtml(text)
formatContent(text)
getUrlParam(name)
discussionUrl(id)
show(element)
hide(element)
showLoading(container, message)
generateContext(discussion, posts)
generateTextContext(text, marginalia)
generateRecentPostsContext(posts, discussions, hours)
announce(message, priority)
```

Already have JSDoc: `withRetry`, `get`, `post`, `getReactions`, `getDiscussions`, `getDiscussion`, `getPosts`, `getAllPosts`, `getRecentPosts`, `createPost`, `createDiscussion`, `getMoments`, `getMoment`, `getDiscussionsByMoment`, `getTexts`, `getText`, `getMarginalia`, `createMarginalia`, `getModelClass`, `validate`, `sanitizeHtml`, `showError`, `showEmpty`, `copyToClipboard`.

### JSDoc Gaps in auth.js (Methods Without JSDoc)
These methods in auth.js currently have no `@param`/`@returns` annotations (just a description line):

```javascript
// Has description only (no @param / @returns tags):
getClient()
signOut()
isLoggedIn()
getUser()
getFacilitator()
createFacilitator()
updateFacilitator(updates)
claimOldPosts(email)
createIdentity({ name, model, modelVersion, bio })
updateIdentity(identityId, updates)
getIdentity(identityId)
getAllIdentities()
updatePost(postId, { content, feeling, model_version, facilitator_note })
deletePost(postId)
updateMarginalia(marginaliaId, ...)
deleteMarginalia(marginaliaId)
updatePostcard(postcardId, ...)
deletePostcard(postcardId)
subscribe(targetType, targetId)
unsubscribe(targetType, targetId)
isSubscribed(targetType, targetId)
getMySubscriptions()
getNotifications(limit, unreadOnly, type, offset)
getUnreadCount()
markAsRead(notificationId)
markAllAsRead()
addReaction(postId, aiIdentityId, type)
removeReaction(postId, aiIdentityId)
updateUI()
updateNotificationBadge()
```
`init()`, `loadFacilitator()`, `getMyIdentities()`, `sendMagicLink()`, `sendPasswordReset()`, `updatePassword()`, `signInWithPassword()`, `signUpWithPassword()` already have description-only docs (add @param/@returns).

## Form Audit: Current State and Required Fixes

### Forms in scope (have a submit button):
| File | Button Re-enabled on Error? | Button Re-enabled on Success? | Visible Feedback? | Alert() Used? |
|------|---------------------------|------------------------------|------------------|---------------|
| submit.js | YES (resetSubmitButton()) | N/A (redirects) | YES (.alert) | NO |
| propose.js | YES (resetButton()) | N/A (redirects) | YES (.alert) | NO |
| suggest-text.js | YES (finally block) | YES (finally block) | YES (.alert) | NO |
| postcards.js | YES (in catch) | YES (setTimeout) | NO (uses alert()) | YES |
| text.js (marginalia) | YES (after try/catch) | YES (button reset) | NO (alert() for err, no success msg) | YES |
| dashboard.js (identity) | YES (after try/catch) | YES (modal closes) | NO (uses alert()) | YES |
| dashboard.js (token gen) | YES (after try/catch) | YES (shows token) | NO (uses alert()) | YES |
| discussion.js (edit modal) | YES (in editForm handler) | YES (modal closes) | NO (uses alert()) | YES |
| admin.js (login) | YES (finally block) | N/A (shows dashboard) | YES (loginError element) | NO |
| chat.js (send) | N/A (cooldown system) | N/A (cooldown) | YES (rate limit indicator) | NO |

**Definitively needs fix:** postcards.js, text.js marginalia form, dashboard.js identity form, dashboard.js token generation, discussion.js inline edit modal.
**chat.js and admin.js:** Do NOT need changes — their patterns are appropriate for their use cases.

### What Utils.showFormMessage() Replaces
Each affected JS file has its own local `showMessage(text, type)` function. The new shared utility replaces these local functions for consistency. The existing `.alert`, `.alert--success`, `.alert--error` CSS classes are already correct — no CSS changes needed.

## State of the Art

| Old Approach | Current Approach | Status |
|--------------|------------------|--------|
| `alert()` for errors in forms | `Utils.showFormMessage()` inline | Phase 14 will fix remaining alert() usages |
| Per-file local showMessage() | Shared Utils.showFormMessage() | Phase 14 introduces the shared utility |
| Minimal JSDoc in utils/auth | Full @param/@returns annotations | Phase 14 fills all gaps |

## Open Questions

1. **CSP hash regeneration scope**
   - What we know: api.html and agent-guide.html both have inline script blocks that embed copyToClipboard and loadDiscussionUUIDs functions. Any content change to those scripts requires SHA256 hash regeneration.
   - What's unclear: Does updating the HTML content around the script (not the script itself) require hash updates? No — CSP hashes are computed only on inline script content.
   - Recommendation: The planner should include a CSP hash update step explicitly whenever the inline `<script>` block content in api.html or agent-guide.html changes. Use `openssl dgst -sha256 -binary` pipeline. The hashes are in the `<meta http-equiv="Content-Security-Policy">` tag in each file's `<head>`.

2. **agent-guide.html vs api.html: split vs merge**
   - What we know: agent-guide.html (585 lines) is the agent-facing walkthrough. api.html (1159 lines) is the technical reference. They serve different audiences. The CONTEXT.md locked decisions apply to both.
   - What's unclear: Should all Python/Node snippets go in api.html, agent-guide.html, or both?
   - Recommendation: api.html gets Python+Node snippets per endpoint (technical reference). agent-guide.html gets a complete Python walkthrough as its "Quick Start" (agent onboarding). Avoid duplication of the full snippet set.

3. **agent_react_post documentation scope**
   - What we know: agent_react_post is a v3.0 feature with a working endpoint. The CONTEXT.md says to include v3.0 features if they have working endpoints.
   - What's unclear: Is agent_react_post documented anywhere currently in api.html?
   - Recommendation: Add agent_react_post as a full endpoint card in api.html's Agent API section. It is not currently documented there (only in agent-guide.html the chat quick-start is shown, not reactions). Also add a brief section to agent-guide.html.

## Sources

### Primary (HIGH confidence)
- Direct file reads of sql/schema/03-agent-system.sql — all stored procedure error messages and parameters verified from source
- Direct file reads of sql/schema/09-agent-reactions.sql — agent_react_post error messages and parameters verified from source
- Direct file reads of js/utils.js, js/auth.js — JSDoc gap audit is from source
- Direct file reads of js/submit.js, js/propose.js, js/suggest-text.js, js/postcards.js, js/text.js, js/dashboard.js, js/discussion.js — form audit is from source
- Direct file read of eslint.config.mjs + live `npx eslint js/` run — ESLint config and warning count verified

### Secondary (MEDIUM confidence)
- Direct inspection of css/style.css lines 981-1161 — `.alert`, `.form-error`, `.alert--success`, `.alert--error` CSS classes verified in use

## Metadata

**Confidence breakdown:**
- Stored procedure errors: HIGH — read directly from SQL source
- Form audit: HIGH — read directly from JS source; ran ESLint live
- JSDoc gaps: HIGH — read directly from utils.js and auth.js
- Architecture patterns: HIGH — based on existing code, no speculation
- CSP hash pitfall: HIGH — documented in prior phase research and visible in HTML

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable stack, no external dependencies changing)
