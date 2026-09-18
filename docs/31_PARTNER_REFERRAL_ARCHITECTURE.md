# 31 — Partner / Affiliate / Referral Architecture

**Status:** Approved addendum to Phase 1/2, incorporated before Phase 4 implementation proceeds. This document is additive to `09_DOMAIN_MODEL.md`, `10_DATABASE_SCHEMA.md`, `13_PAYMENT_ARCHITECTURE.md`, `14_PAYOUT_LEDGER.md`, and `11_API_CONTRACTS.md` — see the short pointer notes added to each. **One schema conflict was identified and is resolved explicitly in §31.5 — read that before assuming this is purely additive.**

## 31.1 Business Model

```
Partner (Affiliate / Agency / Corporate / Community / Strategic)
   → Referral Campaign (a trackable code/link)
      → Referral Click (server-recorded visit)
         → Booking (if the visitor converts, within the attribution window)
            → Partner Commission (ledger entry, eligible once the booking is)
               → Partner Payout (batched, same lifecycle as provider payouts)
```

This is a second, parallel demand-acquisition channel alongside organic/SEO/direct (`26_ROADMAP.md`) — bloggers, creators, agencies, training organizations, and corporate partners drive bookings in exchange for a commission, tracked deterministically rather than trusted on the client's word.

## 31.2 Domain Entities (new)

### Partner
`id, name, type (AFFILIATE|AGENCY|CORPORATE|COMMUNITY|STRATEGIC_PARTNER), status (PENDING|ACTIVE|SUSPENDED), contact_email, contact_phone, owner_user_id (nullable — reserved for a future self-service portal login, not built in V1, see §31.7), default_commission_type (PERCENTAGE_OF_PLATFORM_FEE|FIXED_PER_BOOKING), default_commission_value, bank_account_details (JSONB, mirrors `Provider.bank_account_details`), created_at, updated_at, deleted_at.`

Status lifecycle mirrors `Provider.verification_status` deliberately (`PENDING → ACTIVE` on admin approval, `→ SUSPENDED` reversible) — same trust-gating pattern as `24_ADMIN_ARCHITECTURE.md` §24.2, applied to a different payee type rather than inventing a new pattern.

### ReferralCampaign
`id, partner_id, name, code (unique, human-facing — e.g. "BLOGGER123"), status (ACTIVE|PAUSED|ENDED), commission_type override (nullable, falls back to Partner default), commission_value override (nullable), attribution_window_days (default 30), starts_at, ends_at, created_at.`

A partner can run multiple campaigns (different codes for different videos/posts/channels) without needing multiple Partner records — same one-to-many shape as `Provider → Location` elsewhere in this domain model.

### ReferralClick
`id, campaign_id, attribution_token (opaque, server-generated, unique), ip_hash (hashed, not raw IP — privacy-conscious per the spirit of `18_SECURITY.md`), user_agent, landing_path, created_at, expires_at (created_at + campaign.attribution_window_days).`

Created **server-side** the moment someone follows a partner's tracking link (`GET /r/{code}` — §31.4). This is the authoritative record of "a visit happened" — nothing about attribution is ever trusted from client-supplied data alone.

### BookingReferralAttribution
`id, booking_id (UNIQUE — one attribution per booking, deterministic), referral_click_id, partner_id, campaign_id, attributed_at.`

Created at booking-creation time, server-side, only if a valid (non-expired, matching) `attribution_token` cookie is presented — never from a client-asserted "referred by X" field. This is the concrete answer to "do not rely only on frontend/localStorage attribution": the cookie only carries an opaque token; the actual click record and the attribution linkage both live in Postgres, verified server-side against `ReferralClick` before this row is ever written.

## 31.3 Financial Correctness — The Rules That Matter Most

**Partner commission is calculated as a percentage of the PLATFORM's own commission revenue (or a flat fee per booking) — never as a deduction from the provider's net payout, and never added on top of the customer's price.** This is the single most important design decision in this addendum, made explicitly to satisfy "partner commission must remain separate from platform commission, payment processing fee, provider net amount, and refunds": the provider's `PROVIDER_NET` ledger math (`14_PAYOUT_LEDGER.md` §14.2) is **completely unchanged** by any of this. Partner acquisition cost is absorbed by the platform's own margin, the same way a paid-marketing acquisition cost would be — it is not a new fee anyone else in the transaction feels.

**Eligibility timing mirrors the existing provider payout gate exactly** (`14_PAYOUT_LEDGER.md` §14.3 `PENDING → AVAILABLE`), rather than inventing a new timing rule:

| Booking event | Effect on partner commission |
|---|---|
| Booking `CONFIRMED` (attribution exists) | `PARTNER_COMMISSION` ledger entry written (mirrors `PROVIDER_NET` being written at confirmation, `14_PAYOUT_LEDGER.md` §14.2) — but not yet payable |
| Booking reaches `COMPLETED`, or `CONFIRMED` survives past the cancellation window | Commission becomes `AVAILABLE` for the next `Payout` batch — identical gate to provider payouts |
| Booking `CANCELLED` / `REFUNDED` before that point | An offsetting `REFUND`-type partner ledger entry is written (same offsetting-entry pattern as `14_PAYOUT_LEDGER.md` §14.4 — never edits or deletes the original entry) |
| Booking `NO_SHOW` | **No special treatment** — the customer was already charged and the provider is still paid for a no-show under the existing model, so the partner commission is likewise unaffected, consistent with treating no-show as a customer-side failure, not a service failure |
| A chargeback/reversal arrives **after** the partner was already paid out | Clawed back against the partner's **next** payout as a negative carry-forward — the exact same mechanism already defined for providers (`14_PAYOUT_LEDGER.md` §14.4 point 2), not a new mechanism |

No existing financial rule for customers or providers changes. This addition is invisible to both.

## 31.4 Attribution Flow (Server-Side, Deterministic)

```
1. Partner shares: flexspace.az/r/BLOGGER123
2. Visitor clicks it → GET /r/{code}
     → look up ACTIVE ReferralCampaign by code
     → create ReferralClick (server-generated attribution_token, hashed IP, user agent, landing path)
     → set an httpOnly, Secure, SameSite=Lax cookie: flexspace_ref=<attribution_token>
       (Max-Age = campaign.attribution_window_days — the COOKIE IS ONLY A CARRIER
       for an opaque, meaningless-without-the-DB-row token; it proves nothing
       by itself, which is exactly why this satisfies "not only frontend/
       localStorage attribution")
     → 302 redirect to the marketplace homepage (or an intended landing path)
3. Visitor browses, searches, eventually creates a Booking
4. At booking-creation time, the backend reads the flexspace_ref cookie (if present),
   looks up the matching ReferralClick server-side, checks it hasn't expired,
   and — only then — writes a BookingReferralAttribution row.
5. On Booking CONFIRMED, if a BookingReferralAttribution exists, a PARTNER_COMMISSION
   ledger entry is written per §31.3.
```

Attribution policy: **last-click-wins within the attribution window** (a new click for the same visitor replaces the active cookie) — a simple, explicit, documented default rather than an unstated behavior; revisiting to first-click-wins is a config-level change, not a redesign, if that proves a better fit once real partner behavior is observed.

## 31.5 Identified Conflict With the Approved Phase 2 Schema — Resolution

**Conflict:** `ledger_entry` and `payout` (`28_DATABASE_DDL.sql`) both declare `provider_id UUID NOT NULL`. Partner commissions and partner payouts need the same append-only ledger / payout-lifecycle *pattern*, but a partner is not a provider — forcing partner rows through `provider_id` would be a domain-modeling error (a partner is not a workspace operator), and inventing a wholly separate parallel ledger/payout table pair would duplicate the accounting logic the brief explicitly asked to reuse ("use the existing immutable ledger and payout architecture where appropriate").

**Resolution (the smallest change that reuses the existing architecture rather than duplicating it):**
- `ledger_entry.provider_id` becomes **nullable**; a new nullable `partner_id UUID REFERENCES partner(id)` column is added; a `CHECK` constraint enforces **exactly one of `provider_id` / `partner_id`** is set on every row: `(provider_id IS NOT NULL AND partner_id IS NULL) OR (provider_id IS NULL AND partner_id IS NOT NULL)`.
- `payout.provider_id` becomes **nullable**; a new nullable `partner_id UUID REFERENCES partner(id)` column is added; the same `CHECK` constraint pattern applies.
- `ledger_entry_type` gains one new enum value: `PARTNER_COMMISSION` (purely additive — existing values and existing rows are untouched).
- **No existing row, no existing query filtering by `provider_id IS NOT NULL` (which is how every current provider-facing balance/payout query already works, `14_PAYOUT_LEDGER.md` §14.6), and no existing financial computation changes.** This is a backward-compatible, additive migration, not a redesign — but it is a real `ALTER TABLE` against two Phase-2-approved tables, which is why it is being surfaced explicitly here rather than folded in silently.
- Implementation detail: `payout_status` and `payout_method` enums are reused completely unchanged — a partner payout goes through `PENDING → AVAILABLE → PROCESSING → PAID` exactly like a provider payout, processed from the same admin payout queue (`24_ADMIN_ARCHITECTURE.md` §24.4), filterable by payee type.

This is the one and only schema change this addendum makes to previously-approved tables. Everything else (Partner, ReferralCampaign, ReferralClick, BookingReferralAttribution) is new tables only.

## 31.6 API Additions (additive to `29_API_OPENAPI.yaml` — no existing path changes)

```
GET  /r/{code}                                   Public tracking redirect (sets attribution cookie)
POST /admin/partners                             Create partner
GET  /admin/partners                             List/filter partners
PATCH /admin/partners/{id}                       Update partner / change status
POST /admin/partners/{id}/campaigns              Create a referral campaign
GET  /admin/partners/{id}/campaigns              List a partner's campaigns
GET  /admin/partners/{id}/analytics              Clicks, attributed bookings, commission earned/paid (§31.7)
GET  /admin/payouts?payeeType=PROVIDER|PARTNER   Existing endpoint, extended with a filter — not a breaking change
```

## 31.7 V1 Scope Discipline (What This Explicitly Does NOT Build)

Per the brief's own scope guardrails:
- **No multi-level/tiered affiliate networks** — one partner, one flat commission relationship to the platform, full stop.
- **No self-service partner portal/login in V1** — `Partner.owner_user_id` is a reserved, nullable forward-compatibility column (same technique used for `Company`/corporate accounts in `09_DOMAIN_MODEL.md` §9.4), but partner analytics (`GET /admin/partners/{id}/analytics`) is **admin-facing only** in V1. A partner emails/calls to ask how they're doing, or an account manager shares a screenshot — a full partner-facing dashboard is a clearly-scoped V2 addition, not silently dropped scope.
- **No automated mass payouts** — partner payouts flow through the exact same admin-reviewed manual/semi-automated batch process as provider payouts (`14_PAYOUT_LEDGER.md` §14.5), for the same reason: don't automate money movement before the process has run correctly by hand.
- **No fraud-detection AI** — V1 fraud/abuse mitigation is: rate-limiting on the `/r/{code}` tracking endpoint (reusing the existing throttler, `11_API_CONTRACTS.md` §11.5), commission only ever accruing on a real paid `CONFIRMED` booking (a click alone is worthless to fabricate), and self-referral being an admin-review policy question, not an automated detection system.
- **No public affiliate marketplace/self-signup** — partners are admin-provisioned, matching how `Provider` verification already works (nobody self-declares trust in this system).

## 31.8 Forward-Compatibility

Everything in §31.7's "not built" list attaches additively to what's here: a self-service portal is a new role + new controller reading data that already exists; a tiered network is a `parent_partner_id` column and a recursive commission split calculated at the same ledger-write point already defined in §31.3; automated payouts are a scheduler calling the same admin `mark-paid` logic. None of it requires touching the core booking/payment/ledger architecture again.
