# Self-serve invites for NEAR Legion holders

**Date:** 2026-08-13
**Scope:** New public claim flow. Spans two repos — `trace-commons-server`
(claim endpoints, NEP-413 verification) and `trace-commons-community` (the
`/legion` page). No database migrations.

## Problem

The pilot is invite-only, and every invite today is minted by hand by the
operator. That hand-minting is the growth ceiling: the register cannot reach
people the operator does not already know, which sits badly against the
access-asymmetry thesis published on the landing page.

The NEAR Legion is an adjacent community — decentralized-AI practitioners on
NEAR, organised around a Telegram cohort and an on-chain token. They are close
to the contributor profile the pilot wants. Giving holders a self-serve path to
invite codes converts a hand-operated queue into a bounded, auditable, open
door.

## What holders get

A holder connects a NEAR wallet at `/legion`, proves control of the account,
and receives **one invite code redeemable 3 times** — codes they hand out. One
live grant per NEAR account. Total claims bounded by a global cap.

## Findings that shaped the design

These were verified against mainnet and the contract, and they invalidate the
obvious version of this feature.

**The token is not soulbound.** The collection is described as an SBT, but
`nearlegion.nfts.tg` has ~7,219 transfers across its supply, and token #0 is
held by `intents.near` — a contract, not a person. Tokens can be bought,
borrowed, or held transiently. Holding one proves nothing about identity.

**Minting is permissionless.** Per the Legion onboarding docs, joining is
"visit nearlegion.com, mint your SBT, join Telegram." Absent a cutoff, "anyone
who has a NEAR Legion NFT" means "anyone willing to mint one."

**There is no on-chain mint timestamp.** `issued_at` is `null` across the
collection, so a time cutoff would require an indexer rather than an RPC view
call.

**Holder distribution is treasury-heavy.** `nft_total_supply` reports 3,333;
nearblocks reports 1,326 indexed tokens across 266 holders. In a 600-token
sample, `nearlegion.near` (treasury) held 422 and `intents.near` held 52, with
72 of 84 remaining accounts holding exactly one. The addressable set is roughly
**260 real accounts**. (The 266 figure is nearblocks'; first-party enumeration
was cut short by public-RPC rate limiting.)

**Consequence:** the NFT is a soft signal, not a gate. The **global cap is what
actually bounds this feature**, and the public copy must say so rather than
implying the token is a meaningful filter.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| What is granted | One code, `max_uses = 3` | Holders distribute; matches the schema default |
| Eligibility | Live ownership check, no snapshot cutoff | Simplest to operate; the cap does the limiting |
| Bound | Global cap on live `near-legion` grants | The real gate, since minting is open |
| Proof of control | NEP-413 signed message | Gas-free, standard, unforgeable |
| Tenancy | `derived` — one tenant per redeemer | Each contributor sets their own consent scope, per the published commitment |
| Grant lifetime | 30 days | Unclaimed allotments expire rather than linger |

Explicitly rejected: a frozen holder snapshot (bounds the cohort better, but
costs an indexer job and freezes out latecomers); trusting a typed account ID
without proof (trivially forgeable — anyone could drain a known holder's
allotment).

## Server design

### No migrations

`onboarding_invite_grants` (V42) already models this. A Legion claim is a row:

| Column | Value | Note |
|---|---|---|
| `policy_label` | `near-legion` | Separate pool from operator invites |
| `credential_binding_hash` | `sha256("near-account:" + account_id)` | The unique index `(policy_label, credential_binding_hash) WHERE revoked_at IS NULL` **is** the one-claim-per-account rule — enforced in Postgres, not application logic |
| `issuance_source` | `near-legion-sbt` | Distinguishes self-serve from `operator` in audit |
| `max_uses` | `3` | Schema default |
| `tenant_mode` | `derived` | With a configured `tenant_template_id` |
| `expires_at` | now + 30 days | |
| `issued_by_label` | `near-legion-claim` | |

`note_label` and `issued_by_label` are operator free text and are never
returned to non-admin callers, so the claimant's NEAR account ID is recorded
**only** as the salted-prefix hash. The raw account ID is not stored.

The `trace_invite_registry` role holds `SELECT, INSERT, UPDATE` under a
permissive policy, so both the cap count and the insert run without a schema
change.

### Routes

New module `crates/trace-commons-server/src/near_legion_claim.rs`.

**`POST /v1/onboard/near-legion/challenge`**
Request `{ account_id }` → `200 { nonce, message, recipient, expires_at }`.
Nonce is 32 CSPRNG bytes, single-use, 5-minute TTL, bound to `account_id`.

**`POST /v1/onboard/near-legion/claim`**
Request `{ account_id, public_key, signature, nonce }` →
`201 { invite_code, max_uses, expires_at }`.

Checks, in order, each with a distinct error label:

1. Nonce valid, unexpired, unconsumed, and bound to this `account_id`.
2. **NEP-413 verification** — borsh-serialize `{ message, nonce, recipient,
   callbackUrl }`, prepend the prefix tag `2^31 + 413`, sha256, ed25519-verify
   against `public_key`.
3. `public_key` is a **FullAccess** key on `account_id`, via RPC
   `view_access_key`. Without this, step 2 proves possession of *a* key, not
   control of *the* account — a function-call access key issued to any
   unrelated dapp would otherwise pass.
4. `nft_supply_for_owner({ account_id })` on `nearlegion.nfts.tg` returns > 0.
5. **Denylist** — reject `nearlegion.near` (treasury), `intents.near`, and any
   account in a configured list. Without this the treasury, which holds the
   large majority of supply, can claim.
6. Global cap — count live `near-legion` grants; reject if at cap.
7. `insert_invite_grant(...)`. `CredentialAlreadyBound` maps to `409`.

**`GET /v1/community/near-legion-status`**
→ `200 { claimed, cap, remaining }`. Public and cacheable. Deliberately placed
under `/v1/community/` so the existing `public/_worker.js` proxy serves it with
no worker change.

### Error taxonomy

Public labels, no internal detail: `ChallengeNonceInvalid`,
`ChallengeNonceExpired`, `SignatureInvalid`, `PublicKeyNotFullAccess`,
`AccountHoldsNoLegionToken`, `AccountNotEligible` (denylist),
`InviteCredentialAlreadyBound` (409), `NearLegionClaimCapReached` (409),
`NearRpcUnavailable` (503).

### NEAR RPC

Use a keyed provider (FastNEAR or equivalent) configured via
`TRACE_COMMONS_NEAR_RPC_URL`, **not** `rpc.mainnet.near.org` — public RPC rate
-limits aggressively under even light enumeration. Both view calls take a
bounded timeout and surface `503 NearRpcUnavailable` rather than hanging the
request.

### Abuse controls

- Per-IP rate limit on both `challenge` and `claim`.
- Nonces are single-use and expire; a consumed nonce cannot be replayed.
- The cap check and the insert are ordered so a race can overshoot the cap by
  at most the number of concurrent in-flight claims; the cap is a soft bound
  and this is acceptable.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TRACE_COMMONS_NEAR_LEGION_ENABLED` | `false` | Feature flag; off closes the surface |
| `TRACE_COMMONS_NEAR_LEGION_CLAIM_CAP` | `100` | Global cap (→ up to 300 seats). Operator-tunable without redeploy |
| `TRACE_COMMONS_NEAR_LEGION_CONTRACT` | `nearlegion.nfts.tg` | |
| `TRACE_COMMONS_NEAR_LEGION_DENYLIST` | `nearlegion.near,intents.near` | |
| `TRACE_COMMONS_NEAR_LEGION_TENANT_TEMPLATE` | — | Required when enabled |
| `TRACE_COMMONS_NEAR_RPC_URL` | — | Keyed provider |

## Frontend design

### `/legion` page

New Astro page `src/pages/legion.astro` plus a client island
`src/scripts/legion-claim.ts`, following the `/profile` + `profile-app.ts`
pattern already in the repo.

Backend calls go **cross-origin directly to `TC_INGEST_BASE`**, the same way
`profile-app.ts` already calls the issuer and ingest. This requires CORS on the
two claim routes. The remaining-count call goes same-origin through the
existing proxy.

### State machine

```
idle ──connect──> connected ──sign──> signing ──> claiming ──> code_shown
  ^                   |                  |            |
  └───────────────────┴──────────────────┴────────────┴──> error ──retry──> idle
```

`error` carries the server's error label and renders copy per case — a
cap-reached error and a signature failure are different situations for the
user and must not collapse into "something went wrong."

### One-shot code display

The invite code exists in exactly one response body and is never stored
server-side or retrievable afterward. The success state must say so plainly and
offer copy-to-clipboard. This is a correctness requirement, not a nicety: a
user who navigates away has lost the code permanently.

### Dependency

NEP-413 `signMessage` in the browser requires NEAR wallet-selector. Approved by
the user on 2026-08-13. Minimum viable set:

- `@near-wallet-selector/core`
- `@near-wallet-selector/modal-ui`
- one or more wallet modules (MyNearWallet, Meteor, HERE)

Exact versions, transitive counts, and maintenance status to be recorded in
`~/.claude/approved-dependencies.md` at install time. The island must be lazily
loaded so the bundle does not weigh on any other page.

### Copy changes

`src/pages/index.astro` — the "How to join" section gains a second path
pointing at `/legion`, stating plainly that the cap is the bound and that
holding a Legion token is a signal rather than a qualification. This matches
the honest-stage posture established in the access-reframe spec
(`2026-07-29-access-reframe-design.md`), which requires naming where the
project actually is rather than implying more than is true.

## Testing

Written test-first, per the project workflow.

**Server (Rust):**

- NEP-413 known-good vector verifies.
- Wrong nonce, replayed nonce, expired nonce each rejected with their label.
- Valid signature from a FunctionCall key → `PublicKeyNotFullAccess`.
- Valid signature from a non-holder → `AccountHoldsNoLegionToken`.
- Treasury and denylisted accounts → `AccountNotEligible`.
- Cap reached → `409 NearLegionClaimCapReached`.
- Second claim by the same account → `409 InviteCredentialAlreadyBound`.
- RPC timeout → `503 NearRpcUnavailable`, no partial write.
- Feature flag off → route returns 404.
- A successful claim writes exactly one grant with the expected
  `policy_label`, `issuance_source`, `max_uses`, and `tenant_mode`.

**Frontend:**

- State-machine transitions, including every error path back to `idle`.
- Error taxonomy renders distinct copy per label.
- Status fetch failure degrades gracefully — the page still allows a claim
  attempt rather than blocking on an unavailable counter.

## Out of scope

- Any change to operator-minted invites or the `/v1/admin/invites` routes.
- Redemption itself — a Legion-issued code redeems through the existing
  `/v1/onboard` path with no changes.
- Rank- or Telegram-based eligibility. Legion ranks are not on-chain and are
  not queryable.
- A frozen holder snapshot. Rejected above; revisit if the cap proves to be an
  insufficient bound in practice.
