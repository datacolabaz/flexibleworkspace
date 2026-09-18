# 14 — Payout & Ledger Architecture

## 14.1 Why `booking.amount` Is Not Enough

Storing a single total on `Booking` cannot answer "how much does the platform owe Provider X right now, and why," cannot survive a partial refund cleanly, and gives no audit trail if a number is ever disputed. The ledger exists to make every AZN (qəpik) traceable from a specific booking to a specific payout, forever.

## 14.2 Ledger Entry Types (per booking, at confirmation time)

For a `100 AZN` booking with a `10%` commission (illustrative numbers only — see `13_PAYMENT_ARCHITECTURE.md` §13.5 for how the real rate resolves):

| Entry type | Amount | Meaning |
|---|---|---|
| `GROSS` | +100.00 AZN | Full customer charge |
| `PLATFORM_FEE` | −10.00 AZN | Commission owed to the platform |
| `PROCESSING_FEE` | −3.00 AZN | Payment gateway's own fee (e.g. Epoint's 3% card fee, passed through transparently rather than silently absorbed or silently passed to the provider without disclosure) |
| `TAX` | (per legal review, `13_PAYMENT_ARCHITECTURE.md` §13.6) | VAT/tax withholding if applicable — placeholder mechanism built now, rate/applicability pending legal review |
| `PROVIDER_NET` | +87.00 AZN | What the provider is owed after fee + processing (100 − 10 − 3) |

Every entry is `LedgerEntry` (`09_DOMAIN_MODEL.md`) — **append-only**. A refund never edits or deletes these rows; it adds new offsetting entries (see 14.4). This is what makes the ledger auditable: the full history of every adjustment is preserved, not overwritten.

## 14.3 Payout Lifecycle

```
PENDING ──► AVAILABLE ──► PROCESSING ──► PAID
   │                                       │
   └──────────────► FAILED ◄───────────────┘
                       │
                       └──► (retry → PROCESSING) or REVERSED
```

| Status | Meaning |
|---|---|
| `PENDING` | `PROVIDER_NET` ledger entries exist but are still inside the booking's cancellation window — not yet safe to pay out |
| `AVAILABLE` | Cancellation window has passed (or booking reached `COMPLETED`); funds are eligible for the next payout batch |
| `PROCESSING` | A payout batch has been created and the bank transfer/settlement has been initiated |
| `PAID` | Funds confirmed received by the provider (bank confirmation, or manual confirmation by Support/Ops in the admin panel at V1) |
| `FAILED` | Transfer failed (wrong bank details, bank rejection) — provider notified, corrected details required before retry |
| `REVERSED` | A payout already marked `PAID` had to be clawed back (e.g. a late chargeback after payout) — rare, but modeled explicitly rather than left unrepresentable |

**Why `PENDING → AVAILABLE` is a real, separate state:** paying a provider out immediately at booking confirmation, before the customer's cancellation window closes, risks having to claw back money the provider may have already spent. Holding funds as `PENDING` until the cancellation window passes (or the booking completes) is a standard marketplace safeguard and is cheap to implement as a scheduled state transition, not a manual process.

## 14.4 Refunds & Cancellations: Ledger Correctness

When a `CONFIRMED` booking is cancelled and refunded:
1. New offsetting `LedgerEntry` rows are written: `REFUND` (negative, matching the refunded amount) and, if the booking had already progressed to `AVAILABLE`/`PROCESSING` payout status, an `ADJUSTMENT` entry clawing back the `PROVIDER_NET` portion that hadn't been paid out yet.
2. If the provider's payout for that entry was **already marked `PAID`** (rare — only possible if a very late cancellation/chargeback occurs after settlement), the adjustment entry creates a **negative balance carried forward** against that provider's *next* payout, rather than attempting an actual bank clawback (which is unreliable and often not legally straightforward) — this is a standard marketplace pattern and needs to be disclosed in the `Provider Agreement` (`18_SECURITY.md`/legal docs list).
3. The platform's own `PLATFORM_FEE` and `PROCESSING_FEE` shares of a refunded booking are also reversed proportionally — the platform does not keep its commission on a fully refunded booking (partial refunds prorate commission accordingly; exact proration formula is a Phase 2 implementation detail, but the principle — commission is only earned on the portion of the booking that isn't refunded — is fixed here).

## 14.5 Payout Batch Process (V1 — Manual/Semi-Automated)

Given the unresolved automated-split-settlement question (`13_PAYMENT_ARCHITECTURE.md` §13.4), V1 payout execution is:

1. Scheduled job (weekly or biweekly, configurable) aggregates all `AVAILABLE` `LedgerEntry` rows per provider into a `Payout` record (`status = PENDING` → immediately `AVAILABLE` once aggregated, since eligibility was already checked at the entry level).
2. Admin panel (`24_ADMIN_ARCHITECTURE.md`) surfaces a "Payouts to process" queue showing provider, amount, currency, bank details on file.
3. Admin/Finance staff executes the actual bank transfer (manually at first, or via Kapital Bank's transfer API once that integration is verified and built) and marks the `Payout` `PROCESSING → PAID` with a reference number.
4. Provider receives a payout notification + a downloadable statement showing exactly which bookings/ledger entries make up that payout (this transparency is what makes a manual-payout V1 still feel trustworthy to providers, addressing the same "opaque payout" complaint pattern found against LiquidSpace in `03_COMPETITOR_ANALYSIS.md`).

This is deliberately **not** fully automated at launch — with a handful of providers in the first months, a semi-manual, admin-reviewed payout process is lower-risk than fully automating money movement before the process has been proven correct even once. Automation (via Epoint split-payment or a bank transfer API) is a natural V1.1/V2 hardening step once the manual process has run cleanly for a few cycles, not a prerequisite for launch.

## 14.5a Pointer: Partner Payouts Reuse This Exact Lifecycle

`31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.3/§31.5 routes partner commissions through this same `LedgerEntry`/`Payout` machinery — `payout_status` and `payout_method` are reused unchanged, and a partner payout goes through the identical `PENDING → AVAILABLE → PROCESSING → PAID` gate (§14.3) and the identical refund/clawback handling (§14.4), keyed by the new nullable `partner_id` column instead of `provider_id`. §14.6's "ledger is the only source of truth, never an independently maintained balance" applies to partner balances exactly as written, with no changes to this section.

## 14.6 Provider Balance View

`Provider` dashboard "Revenue" and "Payouts" screens (`25_PROVIDER_ARCHITECTURE.md`) are read models computed by summing `LedgerEntry` rows filtered by `provider_id` and status — never a separately maintained "balance" field that could drift from the ledger truth. This is the concrete meaning of "ledger-based provider balance model" from the brief: the ledger is the only source of truth; any displayed balance is a query against it, not an independently updated counter.
