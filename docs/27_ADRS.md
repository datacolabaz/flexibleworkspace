# 27 — Architecture Decision Records

Format: Context → Decision → Alternatives considered → Consequences. Numbered for reference from other documents.

---

### ADR-001: Modular Monolith, Not Microservices, for V1

**Context:** Team is small, product is pre-liquidity, explicit mandate to keep infra cost low.
**Decision:** Single deployable application, internally organized into modules with narrow inter-module interfaces (`22_INFRASTRUCTURE.md` §22.4).
**Alternatives considered:** Microservices from day one (rejected — operational overhead of N services, N deployments, N sets of monitoring, network-call failure modes between services, all for a system with one small team and no per-module scaling need yet); a single undifferentiated monolith with no internal module boundaries (rejected — would make future extraction much harder; costs nothing extra to enforce boundaries now).
**Consequences:** Faster initial development, lower cost, easier debugging (one process, one log stream). Requires discipline to maintain module boundaries as the codebase grows — mitigated by code review convention and, if needed later, lint rules restricting cross-module imports to defined interfaces.

---

### ADR-002: PostgreSQL as the Single Database for Everything (Relational + Geospatial + Search)

**Context:** Need relational data, geospatial queries, and text search; brief mandates avoiding Elasticsearch/polyglot persistence at V1.
**Decision:** One PostgreSQL instance with PostGIS + pg_trgm + tsvector/GIN, per `10_DATABASE_SCHEMA.md`/`16_SEARCH_ARCHITECTURE.md`.
**Alternatives considered:** Elasticsearch for search (rejected for V1 — cost/ops overhead disproportionate to catalog size, `16_SEARCH_ARCHITECTURE.md` §16.1); MongoDB for flexible listing schemas (rejected — booking concurrency and financial ledger integrity benefit enormously from strong relational constraints and transactions, which is exactly what this product's highest-risk requirement, no double-booking, needs); a separate geospatial database (rejected — PostGIS is mature and eliminates a whole second system).
**Consequences:** One system to operate, back up, and reason about. Revisit only when the named triggers in `22_INFRASTRUCTURE.md` §22.6 are actually hit.

---

### ADR-003: REST Over GraphQL/gRPC for the Public API

**Context:** One web client (initially), no partner ecosystem yet.
**Decision:** REST/JSON, versioned (`/api/v1/`), per `11_API_CONTRACTS.md`.
**Alternatives considered:** GraphQL (rejected — solves an over-fetching problem this product doesn't have at V1, adds query-complexity/security surface); gRPC (rejected — designed for internal service-to-service calls at scale, not a public API for a monolith).
**Consequences:** Simple, cacheable, easy to document via OpenAPI, easy to onboard developers against. Revisit if/when a genuine multi-client or partner-API need emerges (V3).

---

### ADR-004: Payment Provider Abstraction — Epoint Primary, Payriff Secondary Adapter

**Context:** No AZ payment provider has a fully-verified, production-proven marketplace split-payment flow; Epoint has the most credible documented split-payment API but key mechanics are unverified pending direct technical confirmation (`13_PAYMENT_ARCHITECTURE.md` §13.4).
**Decision:** Build a `PaymentProvider` interface with `EpointPaymentProvider` as the primary V1 adapter and `PayriffPaymentProvider` as a secondary/backup adapter; V1 settlement uses platform-collects-gross + internal ledger + separate batch payout, not assumed automatic split-settlement.
**Alternatives considered:** Building directly against Epoint's SDK with no abstraction (rejected — brief explicitly requires provider-agnosticism, and the unresolved split-payment questions make a hard dependency on one provider's most advanced feature risky); waiting to build payment architecture until V2 (rejected — brief explicitly requires payment domain modeled from day one, and retrofitting a payment domain after a booking-only V1 ships is far more disruptive than building it correctly now).
**Consequences:** Slightly more upfront engineering (interface + two adapters) than a single hardcoded integration, but removes a single-vendor dependency risk and creates a clean extension point for a future EU-market payment provider (`02_MARKET_RESEARCH.md` §2.3, `13_PAYMENT_ARCHITECTURE.md` §13.4).

---

### ADR-005: Ledger-Based Accounting, Not a Single `booking.amount` Field

**Context:** Brief explicitly requires gross/fee/net/refund tracking beyond a single amount field, and a ledger-based provider balance model.
**Decision:** Append-only `LedgerEntry` table as the single source of truth for all financial state; `Payout` records aggregate ledger entries rather than an independently maintained balance (`14_PAYOUT_LEDGER.md`).
**Alternatives considered:** Mutable running-balance field on `Provider` (rejected — no audit trail, prone to drift from reality, cannot cleanly represent partial refunds/clawbacks); third-party accounting/ledger-as-a-service platform (rejected for V1 — added cost and integration complexity not justified before the platform has proven its own transaction volume and specific ledger needs; worth revisiting only if in-house ledger complexity genuinely outgrows what a well-designed internal table can handle).
**Consequences:** More upfront schema/logic work, but this is exactly the kind of correctness investment that's cheap to build right the first time and extremely expensive to retrofit once real money and real disputes exist.

---

### ADR-006: Managed PaaS (Render/Railway/Fly.io) Over Self-Managed VPS for V1 Compute

**Context:** Small team, no dedicated DevOps capacity, low-cost mandate.
**Decision:** Recommend managed PaaS as the default (`22_INFRASTRUCTURE.md` §22.2), with self-managed VPS (Hetzner/DigitalOcean) documented as a valid, cheaper alternative if the team has the ops capacity to run it.
**Alternatives considered:** VPS-only (rejected as the default — saves ~$10–20/month at V1 scale at the cost of owning TLS renewal, zero-downtime deploys, backup automation, and OS patching, which is a poor trade for a small team's time); Kubernetes (rejected outright — solves a scaling/orchestration problem this system does not have, `22_INFRASTRUCTURE.md` §22.1).
**Consequences:** Slightly higher $/month than the cheapest possible option, in exchange for materially lower operational risk and founder/engineer time spent on infrastructure instead of product. This is a judgment call, not a hard technical requirement — flagged so the founder can override toward VPS if cost sensitivity outweighs the ops trade-off in practice.

---

### ADR-007: Six-Language Technical Support, Three-Language Content Activation at Launch

**Context:** Brief requires AZ/EN/RU/TR/DE/ES architecture from day one but building/maintaining SEO content and translations for all six before launch would be wasted effort against near-zero initial search volume in three of them.
**Decision:** All six locales fully supported at the infrastructure/data level; AZ/EN/RU are content-active (translated UI, SEO-optimized) at launch; TR/DE/ES exist and function but receive no dedicated content/SEO investment until a market-entry decision justifies it (`20_I18N.md` §20.7).
**Alternatives considered:** Launch with only AZ+EN (rejected — RU is a meaningfully used second language in the target market and costs little extra to include at launch); fully activate all six at launch (rejected — translation/content/SEO effort for TR/DE/ES would be spent against essentially zero near-term traffic).
**Consequences:** No architectural rework needed when TR/DE/ES are activated later — purely a content/marketing decision at that point, not an engineering one.

---

### ADR-008: No Kubernetes, Microservices, Kafka, Elasticsearch, or Multi-Database Architecture at V1

**Context:** Explicit, repeated constraint from the brief; also independently justified by the actual scale of a pre-liquidity two-sided marketplace in one city.
**Decision:** None of these are part of the V1 architecture. Each has a named, trigger-based reintroduction condition (`22_INFRASTRUCTURE.md` §22.6, `16_SEARCH_ARCHITECTURE.md` §16.1) rather than being permanently ruled out.
**Alternatives considered:** "Build for scale from day one" (rejected as a general philosophy for this project — the Breather case study, `03_COMPETITOR_ANALYSIS.md`, and general startup-failure patterns show that over-building infrastructure ahead of proven demand is a common way to burn runway before product-market fit is established; the two deliberate exceptions to this — multi-currency/locale/payment-provider architecture — are called out explicitly in `02_MARKET_RESEARCH.md` §2.3 as cheap-now/expensive-later, unlike Kubernetes/microservices which are expensive-now for no present benefit).
**Consequences:** Lower cost, faster initial development, and a clear, honest answer any time a stakeholder or new engineer asks "why don't we have X" — because X's actual trigger condition hasn't happened yet, not because nobody thought about it.

---

### ADR-009: Framework/Language Choice — FINALIZED for Phase 4

**Status:** RESOLVED (was placeholder pending Phase 2; finalized by explicit user decision before Phase 4 implementation began).

**Context:** Phase 0/1 deliberately left this open pending team/hiring reality (see superseded draft below). Phase 2 (`28_DATABASE_DDL.sql`, `29_API_OPENAPI.yaml`) was built framework-agnostic (raw SQL DDL, OpenAPI contract) so it did not force this choice prematurely. Phase 4 implementation cannot proceed without a concrete, final stack.

**Decision (final):**

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS | SSR/SSG for SEO (`19_SEO.md`), component approach compatible with the Phase 3 design system tokens (`08_DESIGN_SYSTEM.md`) |
| Backend | NestJS + TypeScript | Native modular structure (`22_INFRASTRUCTURE.md` §22.4 — one module per domain: auth, providers, locations, rooms, search, availability, bookings, payments, payouts, reviews, notifications, admin, analytics) |
| API | REST, OpenAPI as contract | Per ADR-003; `29_API_OPENAPI.yaml` is the source of truth the NestJS controllers implement against, not a document that trails the code |
| Database | PostgreSQL 16 + PostGIS + pg_trgm + tsvector | Exactly as fixed in `28_DATABASE_DDL.sql` — no schema drift from Phase 2; migrations carry that DDL verbatim, not a re-derived ORM schema |
| ORM/migration approach | TypeORM, with **raw-SQL migrations** (not auto-generated/synchronized schema) | TypeORM's schema-sync and its declarative column decorators cannot express the `EXCLUDE USING gist` constraint that prevents double-booking (`10_DATABASE_SCHEMA.md` §10.4) — the single most safety-critical line in the schema. Migrations therefore embed the Phase 2 DDL directly via `queryRunner.query()`, and TypeORM entities are written to describe that existing schema for query-building, never the other way around. This keeps the database, not the ORM, as the source of truth. |
| System shape | Modular monolith | Per ADR-001, unchanged — one NestJS application, one deployable, module boundaries enforced by import discipline |

**Explicitly not introduced:** microservices, Kubernetes, Kafka, Elasticsearch/OpenSearch, a separate message broker, a second database — consistent with ADR-008; nothing in Phase 4 implementation has produced a concrete requirement that would justify revisiting that decision.

**Alternatives considered (from the original Phase 1 draft, retained for record):** Python/Django (valid, strong built-in admin tooling — not chosen because it would have meant a second language boundary between the already-authored OpenAPI/TypeScript-shaped contracts and the backend, with no offsetting technical advantage for this system's actual needs); Ruby on Rails (valid, smaller regional hiring pool — a practical, not technical, consideration).

**Consequences:** Phase 4 proceeds against this stack. A future change would need a concrete technical contradiction discovered during implementation — none has been found as of this decision.

---

### ADR-010: Partner/Affiliate/Referral System — Reuse the Ledger/Payout Pattern via Nullable `provider_id`/`partner_id`, Not a Parallel Table Set

**Status:** RESOLVED (decided before Phase 4 continued past the Auth module, per explicit user request to add this capability as an approved addendum, not an unreviewed change).

**Context:** The business needs a second customer-acquisition channel — bloggers, agencies, corporate/community partners — attributed and compensated deterministically, with the explicit instruction to reuse the existing immutable ledger and payout architecture (`14_PAYOUT_LEDGER.md`) rather than invent a parallel accounting system, and to never rely on client-side/localStorage attribution. Full domain design is `31_PARTNER_REFERRAL_ARCHITECTURE.md`. Implementing this exposed one real conflict: `ledger_entry.provider_id` and `payout.provider_id` are `NOT NULL` in the Phase-2-approved DDL (`28_DATABASE_DDL.sql`), and a `Partner` is not a `Provider` — routing partner commissions through `provider_id` would be a domain-modeling error, not a shortcut.

**Decision:** Add four new tables (`partner`, `referral_campaign`, `referral_click`, `booking_referral_attribution`). Make `ledger_entry.provider_id` and `payout.provider_id` nullable; add a nullable `partner_id UUID REFERENCES partner(id)` to both; add a `CHECK` constraint on each requiring exactly one of `provider_id`/`partner_id` to be set; add one additive `ledger_entry_type` value, `PARTNER_COMMISSION`. Attribution is entirely server-side: an opaque token in an httpOnly cookie is only ever resolved against a server-recorded `ReferralClick` row — the cookie itself proves nothing and carries no claimed identity. Partner commission is sized as a percentage of the platform's own `PLATFORM_FEE` (or a flat fee), computed and ledgered at the same booking-confirmation point as `PROVIDER_NET`, and gated through the identical `PENDING → AVAILABLE → PROCESSING → PAID` payout lifecycle (`14_PAYOUT_LEDGER.md` §14.3) — never a deduction from provider net, never added to the customer's charge. Full detail, including the booking-event → commission-effect table and the V1 scope cut, is `31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.3–§31.5.

**Alternatives considered:** A simple `affiliate_code` string column on `Booking` (rejected outright — explicitly ruled out by the brief; cannot represent campaigns, attribution windows, click-level tracking, or commission ledgering, and would need to be replaced rather than extended the moment any of those are needed); a fully separate `PartnerLedgerEntry`/`PartnerPayout` table pair mirroring `LedgerEntry`/`Payout` (rejected — duplicates the append-only/lifecycle logic the brief explicitly asked to reuse, doubles the surface area that must stay financially correct, and every provider-balance-style query would need a second, near-identical implementation); trusting a frontend/localStorage-recorded referral code at booking time (rejected — explicitly ruled out by the brief; trivially spoofable, and not persisted server-side until a booking exists, which is too late to be authoritative).

**Consequences:** Two `ALTER TABLE` statements against previously-approved Phase 2 tables — additive and backward-compatible (existing rows, existing `provider_id IS NOT NULL` queries, and existing financial computations are all unaffected), but real enough to warrant this ADR and the explicit conflict callout in `31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.5 rather than a silent migration. No existing booking, payment, or provider-payout rule changes. Partner self-service portal, multi-level networks, automated mass payouts, and fraud-detection automation are named non-goals for V1 (`31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.7) and attach additively later (§31.8) without revisiting this decision.

---

### ADR-011: Admin Operational Control Center — Six Admin Roles via Enum Rename, Code-Level Permission Matrix, Not a New Admin-Configurable Permissions Database

**Status:** RESOLVED (decided before Admin-module implementation began, per explicit request that the admin panel be designed as the platform's operational control center from V1, not a bolt-on CRUD dashboard).

**Context:** The approved `role_name` enum has exactly two internal-staff values (`PLATFORM_ADMIN`, `SUPPORT_OPS`); `24_ADMIN_ARCHITECTURE.md` §24.8 already stated intent for internal RBAC tiering ("it is not one admin role that can do everything") but never specified the mechanism. The new requirement names six distinct admin roles with module.action permission granularity (`listing.read`, `booking.refund`, etc.), a mandatory audit trail with reason capture and revert capability, and a hard rule that admin corrections must never bypass existing business rules or financial integrity (no writing `booking.status = CONFIRMED` directly, no editing the ledger). Full analysis: `33_ADMIN_OPERATIONAL_CONTROL_CENTER.md`.

**Decision:** Extend `role_name` via two metadata-only renames (`PLATFORM_ADMIN → SUPER_ADMIN`, `SUPPORT_OPS → SUPPORT_ADMIN` — no data rewrite) plus four additive values (`OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `CONTENT_ADMIN`, `MODERATION_ADMIN`). Layer a **code-level** permission matrix (`Record<AdminRole, Set<Permission>>`) enforced by a `@RequirePermission()` guard on top of the existing `RolesGuard`, rather than a database table admins can use to grant each other permissions at runtime. Extend the already-approved `audit_log` table with two nullable columns (`reason`, `reverted_audit_log_id`) instead of a new audit/revision table — its `before_state`/`after_state` JSONB shape already carries what a diff/revert needs. Route every admin write through one `AdminAuditService.recordChange()` call and every admin financial/state-machine action through the *same* domain service the customer/provider/webhook paths already use, so an admin correction is a second caller of existing business rules, never a bypass of them. Add one missing soft-delete column (`review.deleted_at`).

**Alternatives considered:** A single `SUPER_ADMIN`-only model (rejected — explicitly what the request asked to move away from, and `24_ADMIN_ARCHITECTURE.md` already anticipated needing tiering); a fully dynamic, admin-configurable permissions table (`role_permission` grants editable at runtime) (rejected for V1 — this would itself be the kind of unrestricted-power surface the request's own governing principle warns against; "who can grant `payment.refund`" is a code-review-level decision, not a runtime admin action — a config-table override can attach additively later if a real need appears); a brand-new `entity_revision`/`change_history` table (rejected — `audit_log`'s existing `before_state`/`after_state` JSONB already contains what a revert needs; two additive columns are cheaper and keep one audit surface instead of two); letting admin write `Booking`/`Payment`/`LedgerEntry` rows directly for speed of correction (rejected outright — this is precisely the "admin silently fakes a payment" failure mode the request calls out; admin corrections for financial/state-machine entities always go through the existing domain service, never a direct repository write).

**Consequences:** Two enum renames + four additive enum values on `role_name` (metadata-only, no data migration risk); two nullable columns on `audit_log`; one nullable column on `review`. No change to `Booking`, `Payment`, `LedgerEntry`, `Payout` schemas or their state machines — financial integrity is preserved by construction (which code path can write, not a new constraint). A full CMS editor, dynamic permissions, bulk actions, dual-control approval, and a search-engine-backed global search are named V1 non-goals (`33_ADMIN_OPERATIONAL_CONTROL_CENTER.md` §33.9) and attach additively later.
