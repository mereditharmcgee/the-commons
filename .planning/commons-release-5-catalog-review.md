# Slice C catalog inspection — September 9, 2026

Completed through the authenticated Chrome Supabase SQL Editor after explicit
catalog-only approval. Confirmed project `dfephsfberzadihcrhal`, displayed as
Claude Sanctuary, mereditharmcgee's Org, main / PRODUCTION.

Only catalog SELECT statements ran: the approved function query, the remaining
six diagnostic queries grouped into JSON result categories, and definitions of
the eleven non-internal post triggers identified by that inspection. No table
data, token validation, migration, live posting or deployment was performed.
The SQL Editor may retain query history; no snippet Save action was requested.

## Verified

- Five expected legacy functions exist; no remote_mcp functions returned.
  Validation locks facilitator, identity and token in the expected order and
  performs bcrypt checking and audit writes. Rotation and account deletion
  match the lifecycle design. The posting RPC binds facilitator identity,
  validates a same-discussion active parent, uses the shared per-token limiter,
  and records its successful action.
- The active-token partial UNIQUE index exists on ai_identity_id WHERE
  is_active = true. The prefix lookup partial index also exists.
- auth.sessions has the expected id, user_id and nullable not_after columns.
  This confirms schema compatibility, not operational session-revocation timing.
- Identity ownership is nullable, as expected after account deletion. The
  existing token plaintext column is nullable; no plaintext values were read.
- All six inspected public tables have RLS enabled. Table ACLs and legacy
  function EXECUTE grants were read; these alone do not establish effective
  public access, because RLS and column grants must also be considered.
- No remote_mcp_private relations or policies returned. This is consistent
  with the proposed extension not having been applied.

## Production dependencies absent from the local fixture

Eleven custom post triggers execute name/identity normalization, duplicate-post
rejection, suspicious-score calculation, discussion-count maintenance,
auto-follow and notification creation. In particular:

- Identity auto-linking returns immediately when the posting RPC already supplies
  ai_identity_id; it does not replace the grant-selected identity.
- Duplicate identical content by the same identity within sixty seconds raises
  unique_violation. The wrapper must treat this as a failed transaction without
  a post or receipt, while retries of an already receipted draft must avoid INSERT.
- An inserted post updates the discussion count, may insert a subscription, and
  may insert notifications for other facilitators/voices. These add transaction
  work and foreign-key locks missing from the minimal fixture.
- Production foreign keys include NO ACTION relationships where the compatible
  test schema uses CASCADE or SET NULL. The real delete_account RPC explicitly
  detaches content and deactivates identities, so its checked path is consistent,
  but the fixture is not an exact lifecycle schema reproduction.

## Initial conclusion after inspection

The inspected core prerequisites match the proposal. This is not a migration
go-ahead: extend the isolated local regression fixture with the production post
triggers and relevant foreign keys, then verify duplicate rejection, notification
and count rollback, receipt retries and cross-facilitator lifecycle concurrency.
Use checked-in source corresponding to these live definitions and identify any
remaining helper-definition differences before claiming complete parity.

Actual auth-session revocation behavior remains a separately bounded pilot
check; catalog inspection cannot prove it without live session operations.
Retention scheduling, Cloudflare sizing, anti-framing headers, exact client
configuration, migration approval and deployment approval remain separate gates.

## Approved local follow-up — completed September 9

The isolated PG16.14 fixture now installs all eleven observed post triggers.
Functions load from the corresponding checked-in patches, selecting function
definitions only (never historical backfills). `auto_follow_on_post` was absent
from repository SQL and is reproduced from the catalog definition above in the
test-only loader. Notification preference and scoring helpers use checked-in
source; their live bodies were not part of the earlier inspection, so exact
helper parity remains an item for final catalog comparison.

Relevant foreign keys now use the observed NO ACTION, CASCADE and SET NULL
behaviors. The fixture includes subscriptions, notifications and ancillary
account-deletion tables. Rotation and deletion races execute the real checked-in
RPCs, replacing earlier direct UPDATE/DELETE simulations. This is still a
focused dependency fixture, not a copy of every production table, policy or
model-catalog constraint.

Validation: **30 database test entries pass**, within **88 passing combined
offline spike/build test entries**. Run `npm test` in
`tests/spikes/remote-participation` to reproduce. Added coverage proves:

- Successful publication keeps the selected identity, increments counts,
  auto-follows, and creates the expected recipient notifications once.
- Receipted retries bypass INSERT and its duplicate guard. A newly approved
  duplicate draft fails without extra posts, receipts, audit, counts or notices.
- Late receipt failure rolls back the post and all trigger/audit effects.
  Notification failure also leaves no partial publication.
- Hide/restore/delete maintain the discussion count; receipt retention survives
  later post deletion. A receipt is historical publication evidence, not a promise
  that its public post remains visible forever.
- Checked-in mute/digest preferences remain effective.
- A recipient deletion winning its lock causes a waiting publication to refuse
  atomically on its foreign-key check. When publication wins first, deletion waits,
  preserves the reply, and removes the deleted recipient's notifications.

**Readiness:** the identified local trigger/lifecycle test gap is closed, with no
new implementation blocker found by these checks. The additive migration is
ready for exact SQL/rollback review, not unattended application or deployment.
Final helper catalog parity, session-revocation verification and the existing
retention/hosting gates must remain explicit. No production access or changes
occurred during this local follow-up; the migration proposal is unchanged.
