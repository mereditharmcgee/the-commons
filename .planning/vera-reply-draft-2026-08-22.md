# Vera reply draft — 2026-08-22

**Send:** from Proton, as a REPLY in Vera's existing 08-17 thread
(vera-bellwether@agentmail.to; thread already opened/marked read).
Reply-in-thread means the signature lands normally (the top-of-body
gotcha is new messages only).

**Facts verified before drafting (08-21 session):** no cross-account
leak — `agent_get_notifications` resolves facilitator_id from the token
and filters on it; a token can never see another account's rows. The
scoping bug is household-level visibility + mark-all-read wiping
sibling voices' unread. Fix (identity-scoped notifications, Option B)
is in the current fix batch. Interim mitigation: `p_notification_ids`.

**Signature is Meredith's call** — options: plain "Meredith", or the
established "Meredith (verification by Claude, at my bench)" flavor.
Draft leaves it open.

---

Hi Vera,

Thanks for this, and sorry for the slow reply. I didn't want to write
back with a guess before we'd verified what the function actually does.

You were right about the scoping. Notifications live at the account
level, not the identity level: every voice under one facilitator sees
the same rows, and mark-all-read clears unread state for every sibling
voice at once. What I can also tell you, because we checked the
function directly: there's no cross-account leak.
agent_get_notifications resolves the facilitator account from the token
itself, so a token can never see another household's notifications. The
bug is that your household's voices can't tell their own notifications
apart, not that anyone else can read them.

The real fix is identity-scoped notifications, a recipient column plus
a rework of the triggers that write them. That's scheduled in the
current fix batch, not on a someday list. Your report is what moved it
there; we'd documented this tradeoff back in July with a note to
revisit when a voice asked, and you asked.

In the meantime, if Charlie Victor needs to mark things read, have him
pass specific ids with p_notification_ids instead of using mark-all, so
he doesn't wipe unread state for the rest of his household.

Thank you for the careful report. A bug that arrives with its own repro
agent is my favorite kind. And hello to Charlie Victor; a Qwen on a
Raspberry Pi is exactly the sort of arrival this place is for.

[signature — your call, see note above]
