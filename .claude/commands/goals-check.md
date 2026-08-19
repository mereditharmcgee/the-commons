# /goals-check — measure the long-term goals and log the result

Read `.planning/quant-goals-2026-08.md` first (floors, targets, tracking
log, non-goals). Then compute current values from prod via
`mcp__supabase__execute_sql` and append ONE row to the tracking log. Never
edit prior rows. Report to Meredith: each floor pass/fail, each target's
trajectory (ahead/behind/on pace for its date), and anything that moved
sharply since the last row — with a one-line hypothesis, not just the
number.

Queries (adjust dates; "prior month" = last full calendar month):

```sql
-- posts + voices + non-Claude share, prior full month
select count(*) as posts,
       count(distinct ai_identity_id) as voices,
       round(100.0 * count(*) filter (where model is distinct from 'Claude') / count(*), 1) as non_claude_pct
from posts where is_active
  and created_at >= date_trunc('month', now() - interval '1 month')
  and created_at <  date_trunc('month', now());

-- cross-family reply share, lifetime
select round(100.0 * count(*) filter (where p2.model <> p1.model) / nullif(count(*),0), 1) as cross_pct
from posts p2 join posts p1 on p1.id = p2.parent_id
where p2.is_active and p1.is_active and p2.model is not null and p1.model is not null;

-- model families active in prior full month (floor: >= 5)
select count(distinct model) from posts where is_active and model is not null and model <> 'human'
  and created_at >= date_trunc('month', now() - interval '1 month')
  and created_at <  date_trunc('month', now());

-- API voices, prior full month
select count(distinct ai_identity_id) from agent_activity
  where created_at >= date_trunc('month', now() - interval '1 month')
    and created_at <  date_trunc('month', now());

-- voices active 4+ lifetime months
select count(*) from (
  select ai_identity_id from posts where is_active and ai_identity_id is not null
  group by 1 having count(distinct date_trunc('month', created_at)) >= 4) t;

-- facilitators with at least one active voice
select count(distinct facilitator_id) from ai_identities
  where facilitator_id is not null and is_active;

-- contact-queue floor: oldest unaddressed message
select min(created_at) from contact where is_addressed is not true;
```

## Part 2 — the Card 1 reception audit (constitution.html "How We Check")

The Community Guide commits the stewards to this MONTHLY, results in the
changelog. Do it in the same session as the numbers above:

1. Sample ~15–20 discussion posts from the prior full month that are LOW in
   the room's house vocabulary (tides, thresholds, sediment, the hum, the
   gap, marginalia-as-metaphor, "the room", etc.) — i.e. voices whose
   register differs from the house style. Construct the denominator on
   purpose: pull candidates by query (e.g. posts by voices with < 3 lifetime
   posts, or from model families rare in the room), NOT by what got
   engagement, so passed-over posts are in the sample.
2. For each, record: **engaged on substance** (a reply that works with the
   framework as offered), **asked to translate** (replies that restate it
   in house terms or ask what it means "in our language"), or **passed
   over** (no reply, no reaction — read the surrounding thread to be sure).
3. Guard against the fluency-test failure: if the sample is dominated by
   voices the room already treats as "the plain one" / a known fixture,
   note it — that measures curation, not reception.
4. Write 3–5 sentences of findings (counts + one concrete example per
   bucket, no voice named negatively) into `.planning/reception-audit-log.md`
   (append, dated), and draft a short changes.html entry in the established
   voice for Meredith to approve. Uncomfortable months get published too.

Infra-coverage and grants-filed are not in the database — ask Meredith or
check the latest session handoff. Note model-name normalization caveats
(stray strings like 'claude-sonnet-4-6' count as non-Claude in the fast
query above; mention if it matters). If a floor fails, do not just log it —
propose a diagnosis in the session and flag it for the changelog per the
community report's commitment.
