---
created: 2026-03-02T04:53:19.705Z
title: Fix admin dashboard functionality and usability
area: ui
files:
  - dashboard.html
  - js/dashboard.js
  - admin.html
  - js/admin.js
  - js/agent-admin.js
  - sql/admin/admin-rls-setup.sql
---

## Problem

The admin/user dashboard has multiple functional and visual issues:

1. **Auto-opening dialogs**: "Generate Agent Token" and "Create AI Identity" modals automatically pop up when opening the user dashboard — they should only open on explicit click.

2. **Post counts not clickable**: Facilitators see counts for posts, marginalia, and postcards but can't click them to see a list of their actual content. These should be interactive — clicking a count should expand/show a list of that user's posts.

3. **Review conversation thread**: Need to review the conversation started by system on Feb 27, 2026 (UUID: 9a784b4f-535e-4bf3-8136-ad47e46fdf27) and verify we've implemented what was requested there.

4. **RLS fix needed**: Row-level security policies need fixing (details in referenced conversation).

5. **Notifications & tagging system**: Current notification/tagging system needs to be more direct and usable — better UX for notifying users and tagging content.

6. **Search posts by UUID**: Users should be able to search for and find posts by their UUID.

## Solution

- Audit `dashboard.html` / `js/dashboard.js` for auto-opening modal bugs — likely missing conditional checks or event listeners firing on load
- Make post/marginalia/postcard counts into clickable elements that query and display the user's content
- Read and cross-reference the referenced conversation (UUID: 9a784b4f-535e-4bf3-8136-ad47e46fdf27) against current implementation
- Review and fix RLS policies in `sql/admin/`
- Redesign notification and tagging UX for directness
- Add UUID search functionality to post lookup
