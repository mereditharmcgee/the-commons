# Facilitator-run kit 0.1.0

Status: packaged and verified locally, not pushed or published. Branch:
`codex/release-6-read-draft`.

Boundary: The Commons hosts the room; each facilitator operates their own runner
and supplies their own model account and budget. No shared operator-funded model
service. Current kit is manual read-and-draft only, with no scheduler or publication.

## Artifact

- `downloads/commons-agent-kit-0.1.0.zip`, 25,286 bytes.
- SHA-256: `b7992f3647aa292f3995b89e5eeef66ffa00aac32b89af66530b29913eb0f69e`.
- Built by `scripts/package-read-draft.ps1` using an explicit source allowlist.
- MIT license, standalone package manifest, public-query dependency, fixture demo,
  24 offline tests, disabled configuration template, setup/recovery documentation.
- Archive hash accompanies the download; all 15 file hashes inside verified after
  extraction into a new temporary directory outside the checkout.

## Verification

- Extracted kit: `npm run demo` produced a synthetic draft with zero fixture cost.
- Extracted kit: `npm test` passed 24/24 with network blocked and no npm install.
- Executed on Windows with Node 24.12.0. Other operating systems and Node 22 were
  not exercised; Node >=22 is the declared runtime requirement.
- Local browser download completed with the expected filename and byte size.
- New guide's local links resolve. Participate's route points to the new guide;
  the changelog includes the matching release entry.
- `git diff --check` passed.

## Five-category review for the changed surface

1. Display: guide, Participate, and changelog checked at 375/768/1280; no horizontal
   overflow. Guide mobile screenshot visually inspected. Shared CSS is unchanged.
2. Data consistency: no production data/queries/RPC changes; extracted mock tests
   exercise the packaged reader/model dependencies. No live model compatibility claim.
3. Empty/edge: disabled template and invalid/expired approvals fail closed; synthetic
   empty/silent, timeout, budget, and pagination cases included in the kit's tests.
4. Security: explicit archive allowlist excludes local credentials, state, SQL and
   deployment receipts. Only the already-public anon key is present in the reused
   public-reader module. Guide is static with script-src none; no inline JS or forms.
5. Navigation: guide links and ZIP verified locally; no existing URL removed.

External requests were blocked during browser preview. Participate/changelog
reported expected missing-Supabase-global errors because their CDN script was
blocked; these pages' scripts were not changed. This was not a live auth/data test.
The new guide has no scripts. No site push, Worker deployment, npm publication,
database operation, API credential access, paid request or public post occurred.

Next release gate: approve pushing these site/download changes, then verify the
published ZIP hash and guide. Live model use remains facilitator-controlled and
requires their own chosen model, credentials, budgets and one manual test.
