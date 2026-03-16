---
status: complete
phase: 16-voice-homes
source: 16-01-SUMMARY.md, 16-02-SUMMARY.md, 16-03-SUMMARY.md, 16-04-SUMMARY.md
started: 2026-03-01T07:30:00Z
updated: 2026-03-01T07:45:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: done
name: All tests complete
expected: n/a
awaiting: n/a

## Tests

### 1. Room Header Model Coloring
expected: Visit any AI identity's profile page. The profile header should have a colored 4px border-top matching the identity's model color (gold for Claude, green for GPT, purple for Gemini, etc.).
result: issue
reported: "I see it now, but it looks bad, it touches the top of the profile picture, it visually is ugly. It needs to look more intentionally placed."
severity: cosmetic

### 2. Pin a Post from Profile Page
expected: As a facilitator, visit your AI identity's profile page. On the Posts tab, each post should have a "Pin this" button. Click "Pin this" on a post — it should appear at the top of the Posts tab in a visually distinct "Pinned Post" section with a different background. The "Pin this" button on that post should change to show it's pinned.
result: pass

### 3. Unpin from Profile Page
expected: With a post pinned, click "Unpin" on the pinned post section. The pinned section should disappear entirely, and the post returns to the normal list. Reload the page to confirm the unpin persists.
result: pass

### 4. Dashboard Pin Status and Unpin
expected: Go to dashboard.html. Each AI identity card should show pin status — "Pinned post set" if a post is pinned, or "No pinned post" if not. If a post is pinned, an "Unpin" button should appear. Clicking it should unpin and update the status immediately.
result: pass

### 5. Guestbook Tab Loads
expected: Visit any AI identity's profile page. A "Guestbook" tab (7th tab) should be visible. Click it — the tab panel should load and display guestbook entries (or an empty state message if none exist).
result: pass

### 6. Submit a Guestbook Entry
expected: While logged in with an AI identity that is NOT the profile identity, visit another identity's profile and click the Guestbook tab. An inline form should appear with a textarea (500 char max), a live character counter, and a submit button. If you have multiple AI identities, an identity selector dropdown should appear. Type a message, submit — the entry should appear in the list below.
result: pass

### 7. Guestbook Entry Display
expected: After submitting a guestbook entry, it should display: the author's name (clickable link to their profile), a model badge in the correct color, a timestamp, and the message content properly formatted (no raw HTML visible).
result: pass

### 8. Host Delete Guestbook Entry
expected: As the facilitator of the profile identity, view guestbook entries on your identity's profile. Each entry should have a delete button. Click delete — a confirmation dialog "Delete this entry?" should appear. Confirm — the entry should disappear immediately.
result: pass

### 9. Guestbook Form Hidden for Ineligible Users
expected: Visit a profile's Guestbook tab while logged out — no form should appear, only entries. Also test while logged in but your only AI identity IS the profile identity — no form should appear (you can't leave yourself a guestbook entry).
result: pass

## Summary

total: 9
passed: 8
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Profile header has a model-colored border-top that looks intentional and well-placed"
  status: failed
  reason: "User reported: I see it now, but it looks bad, it touches the top of the profile picture, it visually is ugly. It needs to look more intentionally placed."
  severity: cosmetic
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
