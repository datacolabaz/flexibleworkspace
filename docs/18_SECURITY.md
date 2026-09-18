# 18 — Security Architecture

## 18.1 Baseline: OWASP Top 10, Applied Concretely

| OWASP category | Concrete FlexSpace control |
|---|---|
| Broken access control | Central RBAC middleware (`11_API_CONTRACTS.md` §11.4) resolving role + ownership on every request; ownership double-checked at the query layer, not just the route layer |
| Cryptographic failures | TLS everywhere; passwords hashed with a modern algorithm (bcrypt/argon2, never reversible encryption); payment card data never touches FlexSpace servers (hosted checkout, `13_PAYMENT_ARCHITECTURE.md`) |
| Injection | ORM/parameterized queries exclusively — no raw string-concatenated SQL, ever, including in admin tooling |
| Insecure design | This entire document set (booking concurrency in `12_RESERVATION_ENGINE.md`, separated payment/booking status in `13_PAYMENT_ARCHITECTURE.md`) *is* the insecure-design mitigation — security is addressed at the domain-model level, not bolted on |
| Security misconfiguration | Infrastructure-as-code for environment config (`22_INFRASTRUCTURE.md`), no default credentials, secrets never committed to source control |
| Vulnerable/outdated components | Automated dependency scanning (e.g. GitHub Dependabot or equivalent — low/no cost) as part of CI |
| Identification/authentication failures | Rate-limited login/OTP endpoints, mandatory 2FA for Admin/Support roles (`11_API_CONTRACTS.md` §11.4), secure session/JWT rotation |
| Software/data integrity failures | Webhook signature verification (18.3), idempotency keys (`10_DATABASE_SCHEMA.md` §10.7) |
| Security logging/monitoring failures | `AuditLog` on every financial/admin action (18.5); error monitoring (`22_INFRASTRUCTURE.md`/`23_COST_MODEL.md` — Sentry) wired from day one |
| Server-side request forgery | Any server-side fetch of a user-supplied URL (if ever needed) goes through an allowlist — not currently a V1 feature surface, noted for future-proofing |

## 18.2 RBAC — Concrete Enforcement Rules

- A `Provider Owner`/`ProviderStaff` can only read/write data scoped to their own `provider_id` (and `location_id`, if staff permissions are location-scoped) — enforced at the data-access layer, so a bug in one endpoint's authorization check can't leak another provider's bookings or revenue.
- A `Customer` can only read/write their own `Booking`, `Payment` (view-only), `Review`, `Favorite` rows — enforced the same way.
- `Platform Admin` has full read access and gated write access to financial actions (refund approval above a threshold, payout marking, verification decisions) — every one of these writes to `AuditLog`.
- `Support/Operations` has read access to bookings/payments and can action refunds **within a configured limit** (e.g. below a certain AZN amount or within a certain time-since-booking window); anything above threshold requires Platform Admin escalation — this tiered-authority model is what the brief's "audit trail for financial actions" requirement is built around, not just logging after the fact.
- **Pointer:** the two-role sketch above (`Platform Admin` / `Support-Ops`) is superseded by the six-role, permission-matrix model in `33_ADMIN_OPERATIONAL_CONTROL_CENTER.md` §33.2/§33.4 (ADR-011) — `Platform Admin` → `SUPER_ADMIN`, `Support/Operations` → `SUPPORT_ADMIN`, plus four new roles. The tiered-authority *principle* stated here is unchanged; the mechanism is now a code-level `@RequirePermission()` matrix rather than an unspecified "tiering."

## 18.3 Payment Security Specifics

- **Payment secrets (API keys, webhook signing secrets) live only in server-side environment configuration**, never in frontend code or client-visible responses — enforced by code review checklist and, ideally, a secrets-scanning CI step.
- **Webhook signature verification is mandatory and fails closed**: an Epoint webhook is verified against its documented SHA1 HMAC scheme before any state change occurs; if Payriff's callback signature mechanism remains unverified/undocumented by launch (`13_PAYMENT_ARCHITECTURE.md` §13.4), the integration additionally re-confirms via Payriff's `getOrderInformation()` lookup API rather than trusting the callback payload alone — never process a financial state change from an unverified/unconfirmed source.
- **Idempotent webhook processing** (`10_DATABASE_SCHEMA.md` §10.7) prevents duplicate-delivery from double-charging or double-confirming.

## 18.4 Secure File Upload (Photos, Review Photos)

- File type validated by actual content inspection (magic-byte check), not just filename extension.
- Size limits enforced server-side before any processing (`22_INFRASTRUCTURE.md` image pipeline).
- Uploaded images are re-encoded/re-processed (resize/compress pipeline, `22_INFRASTRUCTURE.md`) rather than served as-is — this incidentally also strips embedded metadata/EXIF (including GPS data a user might not realize is embedded in a photo) and neutralizes several classes of malformed-file exploit.
- Moderation queue (`Photo.moderation_status`, `09_DOMAIN_MODEL.md`) for provider-uploaded photos before they go public — combined manual/automated (basic NSFW/content-safety check) approach; scope of automation is a Phase 2 vendor decision, not fixed here.

## 18.5 Audit Trail for Financial Actions

Every write to `Payment`, `Refund`, `Payout`, `Provider.commission_percentage`, `Provider.verification_status` triggers an `AuditLog` entry capturing actor, before/after state, and timestamp (`09_DOMAIN_MODEL.md`). This is queryable by Admin (`/admin/audit-logs`, `11_API_CONTRACTS.md`) and is treated as **append-only and never editable**, including by Platform Admins — this is what makes a future dispute ("why was this refund approved") answerable months later.

## 18.6 Fake Review Prevention

- **Structural constraint**: a review can only be created against a `Booking` with `status = COMPLETED` belonging to the reviewing user, enforced at both the service layer and a database constraint (`09_DOMAIN_MODEL.md`) — this alone blocks the most common fake-review vector (reviewing without ever booking).
- **Rate limiting**: review creation is rate-limited per account to prevent rapid-fire review farming even across multiple legitimately-completed bookings.
- **Provider self-review prevention**: a `ProviderStaff`/owner account cannot review their own provider's rooms — checked by cross-referencing the reviewer's role assignments against the room's owning provider.
- **Moderation queue + reporting**: reviews can be flagged by providers for admin review (e.g. suspected competitor sabotage or off-topic content) without giving providers unilateral delete power over reviews, which would undermine trust in the review system itself.

## 18.7 Input Validation, Rate Limiting, CSRF/XSS

- Server-side validation on every endpoint (never trust client-side validation alone), using a schema-validation library tied to the same types used for API contracts (`11_API_CONTRACTS.md`) so validation rules can't silently drift from the documented contract.
- CSRF protection for any cookie-based session flows (same-site cookies + CSRF tokens where applicable); JWT-bearer API calls are inherently less CSRF-exposed but still validated for origin on sensitive actions.
- Output encoding/escaping by default in the frontend framework (avoiding raw HTML injection from user-generated content like review text or room descriptions) — no `dangerouslySetInnerHTML`-style raw rendering of user content.
- Rate limiting per `11_API_CONTRACTS.md` §11.5, tuned specifically against credential-stuffing (login/OTP), scraping (search), and fake-account/fake-review creation patterns.

## 18.8 Legal Documents This Architecture Must Support

Terms of Service, Privacy Policy, Cancellation Policy, Refund Policy, Provider Agreement, cookie/analytics consent (where applicable given `21_ANALYTICS.md`'s tracking), invoice/receipt generation, and tax/VAT fields on invoices where applicable. **Azerbaijan-specific legal and tax treatment of marketplace commission, provider payouts, and consumer protection obligations requires dedicated professional legal/accounting review before launch** — this document defines where these concerns plug into the architecture (data fields, document generation, consent flows) but does not and cannot substitute for that review, and this is called out again as a hard external dependency in `00_RECOMMENDED_FINAL_ARCHITECTURE.md`.
