# 13 — Payment Architecture

## 13.1 Why Booking Status and Payment Status Are Separate Fields

A `Booking` answers "will this reservation happen." A `Payment`/`PaymentTransaction` answers "has money moved, and in which direction." Conflating them into one field breaks down immediately in real scenarios this platform must handle correctly on day one:

- A booking is `CANCELLED` but its refund is still `PROCESSING` for several days — one combined field can't represent "cancelled-but-not-yet-refunded" without inventing awkward compound states.
- A payment can `FAIL` and be retried while the booking stays `PENDING`/`PAYMENT_PENDING` the whole time — the booking's slot hold and the payment attempt have different lifecycles (one hold can survive multiple payment attempts within the hold window).
- Refund accounting (`14_PAYOUT_LEDGER.md`) needs to reference payment-transaction-level detail (which specific charge is being reversed, at what gateway reference) independent of what the booking's customer-facing status currently is.

This is called out explicitly because it is named as a specific requirement in the brief, and it is easy to get wrong under time pressure — this architecture treats it as a hard modeling rule, not a preference.

## 13.2 Provider Abstraction

```
interface PaymentProvider {
  createCheckoutSession(booking, amount, currency): CheckoutSession   // returns hosted redirect URL
  verifyWebhookSignature(rawPayload, signatureHeader): boolean
  parseWebhookEvent(rawPayload): PaymentEvent                          // normalized event: CHARGE_SUCCEEDED | CHARGE_FAILED | REFUND_SUCCEEDED | ...
  refund(paymentTransactionId, amount): RefundResult
  // future, gated behind provider confirmation (13.4): 
  splitPayment?(amount, splits: {recipientRef, amount}[]): SplitResult
}

class EpointPaymentProvider implements PaymentProvider { ... }
class PayriffPaymentProvider implements PaymentProvider { ... }
```

No booking, ledger, or notification code ever references `Epoint` or `Payriff` directly — everything upstream talks to the `PaymentProvider` interface, and a `provider_adapter` field on `Payment` (`09_DOMAIN_MODEL.md`) records which concrete adapter handled a given transaction. Adding a new provider (a future EU acquirer for regional expansion, or Stripe once/if it supports an entity structure that works for FlexSpace) means writing one new adapter class, not touching booking or ledger logic. This is the direct implementation of the brief's explicit requirement to never hardcode a single payment provider.

## 13.3 V1 Flow: Hosted Checkout + Webhook

1. Customer confirms booking details → backend creates `Booking` (`PENDING`) and a `Payment` row, calls `PaymentProvider.createCheckoutSession()`.
2. Customer is redirected to the provider's hosted checkout page (raw card data never touches FlexSpace's own servers — this is also what keeps PCI-DSS scope minimal, see `18_SECURITY.md`).
3. Provider processes the charge and (a) redirects the customer back to FlexSpace's `successUrl`/`errorUrl`, and (b) independently POSTs a webhook to `/api/v1/payments/webhook/{provider}`.
4. **The webhook, not the redirect, is the source of truth for confirming a booking.** The redirect-back is only used to route the user's browser to the right screen quickly; it is never trusted to confirm payment, because a user can close the tab before the redirect fires, or a malicious client could fabricate a redirect callback. Signature verification (`18_SECURITY.md`) + the idempotent upsert on `external_reference` (`10_DATABASE_SCHEMA.md` §10.7) make webhook processing both secure and safe against duplicate delivery.
5. On a verified `CHARGE_SUCCEEDED` event: `PaymentTransaction.status → CAPTURED`, `Booking.status → CONFIRMED`, ledger entries written (`14_PAYOUT_LEDGER.md`), confirmation notifications fire (`17_NOTIFICATION_ARCHITECTURE.md`).
6. If the redirect returns before the webhook has arrived (common — webhooks can lag by seconds), the confirmation page shows a short "confirming your payment..." state that polls booking status, rather than either falsely confirming early or making the user refresh manually.

## 13.4 Marketplace Settlement: What's Actually Available in Azerbaijan Today

Researched directly against provider documentation (Sept 2026):

| Capability | Epoint | Payriff |
|---|---|---|
| Hosted checkout | Yes | Yes |
| Webhook + documented signature verification | **Yes** — SHA1 HMAC, `verifyCallback()` in SDK | Callback exists; signature scheme **not publicly documented** |
| Refund API | Yes | Yes (time-boxed window) |
| Split payment / sub-merchant payout | **Yes** — dedicated `splitPayment()`/`splitCardPayment()` API, explicitly marketed for partner revenue-sharing | Not found |
| Recurring payments | Marketed, built on saved-card tokens (no dedicated subscription endpoint) | Not documented |
| Apple Pay / Google Pay | Yes (CyberSource/Visa widget) | Unverified |
| Published fees | 3% cards, 3.5% Apple/Google Pay; **monthly batch settlement** | Not published |

**Verdict — this is the single most important payment-architecture decision in this document:** Epoint's `splitPayment()` API is real and documented, not just marketing copy, and is the strongest candidate for automated marketplace settlement available in Azerbaijan today. But three things are still unverified and must be confirmed directly with Epoint before V1 relies on it: (a) whether split settlement is real-time or still subject to the same monthly batch cycle stated in Epoint's own terms, (b) whether each provider needs their own independent Epoint/bank merchant contract to be a valid split recipient (which would reintroduce significant provider-onboarding friction), and (c) exact behavior when a split transaction is later refunded.

**Therefore the V1 architecture does not assume split-payment works end-to-end on day one.** It is designed to work correctly either way:

- **Primary flow (safe default):** FlexSpace's own Epoint (or Payriff) merchant account collects 100% of the gross customer charge. The backend computes commission vs. provider-net from the confirmed webhook event and writes it to the ledger (`14_PAYOUT_LEDGER.md`). Payouts to providers are executed as a **separate, platform-initiated batch transfer** (initially manual/semi-automated bank transfer, potentially automated later via Kapital Bank's Open API transfer capability — itself unverified in depth, see `13.6`) on a defined schedule (e.g. weekly or biweekly, T+N days after booking completion to allow for the cancellation window).
- **Fast-follow, not a blocker:** once Epoint's split-payment mechanics are confirmed via direct technical discussion, it can be adopted as an *optimization* that reduces manual payout work — but the ledger/payout domain model (`14_PAYOUT_LEDGER.md`) is designed so this is a plumbing change under the hood, not a new domain concept. The `Payout.payout_method` field already anticipates this (`BANK_TRANSFER` today, `PROVIDER_SPLIT` as a future value).
- Payriff is treated as a **secondary/backup hosted-checkout option only** — no marketplace capability was found for it, and its webhook signature story is unverified, which is itself a reason to prefer Epoint as primary.
- **Stripe is not usable** for an Azerbaijan-domiciled merchant entity today (confirmed against Stripe's own global-availability listing) — not budgeted or architected around for the AZ market. It remains a candidate adapter for a future EU-market expansion where FlexSpace might incorporate an EU entity.

## 13.5 Commission Model (Configurable, Not Hardcoded)

Per `Provider.commission_percentage` (`09_DOMAIN_MODEL.md`), with resolution order: **provider-specific override → category-specific default → platform global default**. Supports:
- Percentage commission (the default mechanism)
- Fixed fee per booking (available as an alternative/addition for categories where a flat fee makes more sense — e.g. very-low-price desk bookings where a pure percentage might round to near-zero)
- Promotional commission (time-boxed reduced rate for early-adopter providers — see `24_ADMIN_ARCHITECTURE.md`/`26_ROADMAP.md` liquidity strategy)
- Category-specific commission (e.g. a different default rate for event spaces vs. meeting rooms, since price points and booking frequency differ structurally)

This is implemented as a small, explicit rules table (`CommissionRule`) resolved at booking-confirmation time and **snapshotted onto the `LedgerEntry`** — a later change to a provider's commission rate never retroactively changes historical ledger entries, which is essential for auditability.

## 13.5a Pointer: Partner Commission Is Not a Payment-Path Change

`31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.3 defines a `PARTNER_COMMISSION` ledger entry, sized as a percentage of the platform's own `PLATFORM_FEE` (or a flat fee) — never a deduction from `PROVIDER_NET`, never added to the customer's charge. Nothing in this document's checkout/webhook/commission-resolution flow changes; the partner commission is computed and written at the same booking-confirmation point described in §13.5, from the platform's own fee, not from a new charge or a new provider deduction.

## 13.6 Legal & Tax Flag (Not Resolved by This Document)

Azerbaijan-specific tax/VAT treatment of marketplace commission, provider payouts, and customer invoicing is **explicitly out of scope for this architecture document** and requires dedicated legal/accounting review before commission percentages, invoice formats, and payout timing are finalized for production. This is flagged again in `18_SECURITY.md`/`26_ADRS.md` and in the final risk register (`00_RECOMMENDED_FINAL_ARCHITECTURE.md`) as a hard external dependency, not something engineering can resolve alone.
