# 00 — RECOMMENDED FINAL ARCHITECTURE
## FlexSpace — Flexible Workspace Marketplace, Azerbaijan-First

**Status:** Living master architecture. The original Phase 0/1 recommendations have progressed into backend and frontend implementation; later approved addenda, including partner referrals (`31`) and the unified activity/event/advertising model (`34`), extend this baseline without replacing its booking and ledger foundations.

---

## 1. Executive Summary

FlexSpace is a commission-based, two-sided marketplace for booking flexible workspace — meeting rooms, coworking desks, private offices, training rooms, studios, and event spaces — by the hour or day, launching in Baku, Azerbaijan, with an architecture designed to expand to Georgia, Turkey, and Europe without a rewrite. It differentiates on being **local, trusted, easy, with real availability, real booking, and local payment rails** — not on being an AI-first or enterprise-first product. The recommended V1 architecture is a **modular monolith on PostgreSQL**, deliberately avoiding Kubernetes, microservices, and Elasticsearch, with a payment domain (commission, ledger, payout) built from day one rather than deferred — because retrofitting payments and multilingual architecture later is far more expensive than building both in from the start, while retrofitting Kubernetes/microservices later is comparatively cheap once (and if) real scale demands it. Estimated V1 infrastructure cost: **roughly $10–50/month** at pre-liquidity traffic, growing to **~$100–200/month** at early traction (`23_COST_MODEL.md`).

## 2. Product Vision

*"Work. Teach. Meet. Create. Anywhere."* — one trusted booking layer across every independent flexible-workspace operator in Azerbaijan, starting with the categories with the clearest, most frequent demand (meeting rooms, desks, training rooms) and expanding into underserved niches (studios, event spaces) where zero dedicated local marketplace exists today (`01_PRODUCT_REQUIREMENTS.md`, `03_COMPETITOR_ANALYSIS.md`).

## 3. Target Customers

Freelancers/remote workers, corporate trainers/tutors, SME office managers booking meeting/interview rooms, and content creators needing studio space — detailed as personas P1–P4 in `04_PERSONAS.md`.

## 4. Personas

Full detail in `04_PERSONAS.md`: four customer personas (P1–P4), three provider personas (P5–P7, spanning single-location to multi-branch operators), and two platform personas (Admin, Support/Ops).

## 5. Global Competitor Analysis

LiquidSpace, Deskpass, Worka (IWG/Instant Group — already present in Baku, enterprise-skewed), Croissant, plus category comparables Peerspace (20% take rate) and Giggster (19% take rate), and the Breather cautionary tale (leased-inventory model, insolvent 2020). Full analysis in `03_COMPETITOR_ANALYSIS.md`. **Synthesis: pure commission marketplace, asset-light, free-to-list — not subscription/hour-bank — is the correct Year-1 model.**

## 6. Azerbaijan Market Opportunity

Fragmented, informal supply (Instagram/phone/WhatsApp-based discovery) with no dedicated neutral multi-operator marketplace currently serving this need — detailed in `02_MARKET_RESEARCH.md`. **Flagged gap: no verified AZ-specific market-sizing (TAM/SAM/SOM) data exists in this research pass** — see §37.

## 7. Value Proposition

LOCAL + TRUSTED + EASY + REAL AVAILABILITY + BOOKING + MULTILINGUAL + LOCAL PAYMENTS — every one of these six words maps to a concrete architectural commitment in this document set, not just a slogan: local (AZN-first, AZ-language-first), trusted (admin-gated verification, `24_ADMIN_ARCHITECTURE.md`), easy (≤4-step booking flow, `05_USER_FLOWS.md`), real availability (DB-enforced, never-double-booked, `12_RESERVATION_ENGINE.md`), booking (not just a directory), multilingual (`20_I18N.md`), local payments (`13_PAYMENT_ARCHITECTURE.md`).

## 8. Business Model

Commission on completed bookings (primary) + provider/organizer professional tiers (secondary) + clearly labeled featured/sponsor inventory (tertiary) + partner referrals paid from Spotva's own platform fee. See §9, `25_PROVIDER_ARCHITECTURE.md`, `31_PARTNER_REFERRAL_ARCHITECTURE.md`, and `34_UNIFIED_EXPERIENCE_EVENTS_ADS_MONETIZATION.md`.

## 9. Marketplace Economics

Starting commission recommendation: **10–15%**, configurable per provider/category, undercutting the two verified global comparables (Peerspace 20%, Giggster 19%) to accelerate early trust-building host acquisition (`03_COMPETITOR_ANALYSIS.md` §3.6, `13_PAYMENT_ARCHITECTURE.md` §13.5). This is a judgment call informed by comparables, not a sourced industry benchmark for Azerbaijan specifically — revisit once real unit economics are observed.

## 10. Listing Pricing Model

FREE / STARTER / PRO / ENTERPRISE tiers, with every limit (locations, rooms, photos, staff seats) derived from actual cost drivers identified in `23_COST_MODEL.md`, not arbitrary numbers — full table and reasoning in `25_PROVIDER_ARCHITECTURE.md` §25.2. Bookings are **never** limited by tier — throttling a provider's revenue-generating activity would work against the platform's own commission revenue.

## 11. Payment Model

Hosted checkout via `PaymentProvider` interface (`EpointPaymentProvider` primary, `PayriffPaymentProvider` secondary), webhook-confirmed (never redirect-confirmed), booking status and payment status kept as **separate fields on separate entities** — full detail in `13_PAYMENT_ARCHITECTURE.md`. Critical finding: Epoint has a real, documented split-payment API, but its settlement-timing and per-provider-onboarding mechanics are unverified pending a direct technical conversation — V1 does not architecturally depend on it working (§13.4).

## 12. Provider Payout Model

Append-only ledger (`GROSS/PLATFORM_FEE/PROCESSING_FEE/TAX/PROVIDER_NET/REFUND` entries) → `Payout` batch aggregation → manual/semi-automated bank transfer at V1, with automation (Epoint split or bank-API-driven) as a fast-follow once verified — full detail in `14_PAYOUT_LEDGER.md`.

## 13. User Journeys

`Landing → Search → Results → Room Detail → Availability → Booking → Payment → Confirmation`, registration deferred to the payment step (not a pre-search gate) — `05_USER_FLOWS.md`.

## 14. Information Architecture

Three separate site trees (customer, provider, admin) with locale as a first URL path segment for SEO — `06_INFORMATION_ARCHITECTURE.md`.

## 15. UX Architecture

Search-first homepage, synced list+map on desktop, list/map toggle on mobile, sticky booking panel, uniform price-breakdown pattern across every screen — `07_UX_ARCHITECTURE.md`.

## 16. Page-by-Page Specification

Covered across `06_INFORMATION_ARCHITECTURE.md` (site maps) and `07_UX_ARCHITECTURE.md` (screen-level behavior for homepage, search results, room detail).

## 17. Design System Specification

Token-based (spacing/type/color), professional-marketplace tone (not corporate-heavy, not bare CRUD), full component inventory with required states — `08_DESIGN_SYSTEM.md`.

## 18. Domain Model

`Provider → Location → Room → Availability → Booking`, ~25 entities including `LedgerEntry`, `Payout`, `AuditLog`, with an explicit forward-compatibility path for corporate accounts (`Company/Employee/Budget`) that requires no V1 schema rework — `09_DOMAIN_MODEL.md`.

## 19. Database ERD Description

PostgreSQL + PostGIS + pg_trgm + tsvector; money as integer minor units; UTC timestamps + per-location IANA timezone; **double-booking prevented by a database-level exclusion constraint**, not application logic — `10_DATABASE_SCHEMA.md`.

## 20. API Architecture

REST, versioned, JWT-based auth, centralized RBAC middleware, idempotency keys on payment/booking mutations — `11_API_CONTRACTS.md`.

## 21. Reservation Engine

Availability computed live from five composed inputs (opening hours, availability rules, blocked periods, existing bookings, buffers); concurrency guaranteed by a Postgres exclusion constraint; explicit 10-state booking state machine — `12_RESERVATION_ENGINE.md`.

## 22. Payment Architecture

See §11 above; full detail in `13_PAYMENT_ARCHITECTURE.md`.

## 23. Google Maps Architecture

Distance calculations done via free PostGIS math, not billed Distance Matrix calls; geocode-once-and-cache; lazy-loaded map component; documented MapLibre/OSM fallback if costs spike — `15_MAPS_ARCHITECTURE.md`.

## 24. Search Architecture

PostgreSQL-first (GIN/GIST/tsvector), explicit rejection of Elasticsearch for V1 with a named migration trigger (~5,000–10,000 active listings), transparent/configurable relevance-ranking formula — `16_SEARCH_ARCHITECTURE.md`.

## 25. Notification Architecture

Channel-abstracted `NotificationService`; email + SMS built for V1 (SMS used selectively for cost control); WhatsApp/push deferred to V2 — `17_NOTIFICATION_ARCHITECTURE.md`.

## 26. Multilingual Architecture

Translation-key-driven, zero hardcoded strings, six locales technically supported, three content-active at launch (AZ/EN/RU) — `20_I18N.md`.

## 27. SEO Architecture

SSR/ISR for indexable pages, locale-first URLs, hreflang, structured data, sitemap — `19_SEO.md`.

## 28. Security Architecture

OWASP-mapped controls, tiered RBAC with ownership checks at the query layer, mandatory admin 2FA, webhook signature verification, fake-review structural prevention, full financial audit trail — `18_SECURITY.md`.

## 29. Analytics Architecture

First-party event model feeding both an internal conversion funnel and tier-gated provider analytics — `21_ANALYTICS.md`.

## 30. Admin Architecture

Verification workflow, dispute resolution, financial approval tiers, full audit-log visibility — `24_ADMIN_ARCHITECTURE.md`.

## 31. Provider Architecture

Dashboard scope, plan tiers with cost-derived limits, alternative revenue model evaluation — `25_PROVIDER_ARCHITECTURE.md`.

## 32. Infrastructure Architecture

Modular monolith + managed Postgres + object storage + CDN + managed PaaS hosting, explicit LOW-COST vs. SCALE-UP architecture diagrams with named triggers for every scale-up move — `22_INFRASTRUCTURE.md`.

## 33. Monthly Cost Model

~$10–50/mo (LOW) → ~$100–200/mo (MEDIUM) → ~$300–500+/mo (HIGH, before Maps growth) — full sourced breakdown in `23_COST_MODEL.md`, with Google Maps flagged as the one line item that can grow disproportionately without active management.

## 34. V1/V2/V3 Roadmap

Full scope table and category/geography sequencing logic (Baku-only first; desks moved up to priority #2 ahead of training rooms for faster liquidity) in `26_ROADMAP.md`.

## 35. ADR Decisions

Nine key decisions recorded with alternatives and consequences (modular monolith, PostgreSQL-first, REST, payment adapter pattern, ledger-based accounting, managed PaaS, phased i18n activation, no-Kubernetes/no-microservices, and a placeholder framework recommendation) — `27_ADRS.md`.

---

## 36. Critical Architecture Review

*This section does the thing explicitly requested: it does not simply accept the brief's assumptions.*

### What's right
- Refusing Kubernetes/microservices/Elasticsearch at V1 is correct and well-justified given actual expected scale — this is the single most important cost-discipline decision in the whole plan, and it's validated by the Breather case study (leased-inventory overreach killed a well-funded competitor; infra overreach is the same mistake in a different domain).
- Building the payment/ledger domain from day one (not deferring to V2) is correct — a marketplace's core trust promise is inseparable from correct money handling, and retrofitting a ledger onto a live system with real transaction history is materially riskier than building it first.
- Separating booking status from payment status is correct and prevents a whole class of bugs that are easy to dismiss as "we'll handle it later" and hard to fix once bookings exist in production.
- The multilingual/multi-currency architecture-now, content-activation-later split is a smart way to satisfy "build for the future" without paying the SEO/translation cost for languages with near-zero initial traffic.

### What's risky
- **The Epoint split-payment dependency is the single largest unresolved technical risk in this plan.** If direct technical confirmation reveals per-provider merchant onboarding is required for split payments, the "low-friction provider onboarding" value proposition takes a real hit for whichever providers can't/won't complete that onboarding — mitigated by the fact that V1 doesn't architecturally require split payments to work at all (§11), but this should be resolved with Epoint **before**, not during, Phase 2.
- **Legal/tax treatment of marketplace commission and provider payouts is completely unresolved** and touches almost every other financial decision in this document (commission percentage net of tax, invoice format, whether the platform needs to withhold anything on a provider's behalf). This is flagged repeatedly (`13_PAYMENT_ARCHITECTURE.md` §13.6, `18_SECURITY.md` §18.8) but bears restating here: **do not finalize commission percentages or launch payouts to real providers before a local lawyer/accountant has reviewed this.**
- **Google Maps cost growth is a real, not hypothetical, risk** at higher traffic (`23_COST_MODEL.md` §23.3) — the mitigations are designed in, but nobody is currently watching this metric; recommend a concrete Maps-spend alert threshold be set up before launch, not after a surprise bill.
- **The manual/semi-automated V1 payout process (`14_PAYOUT_LEDGER.md` §14.5) is a real operational burden**, not just a technical placeholder — someone on the team needs to actually execute bank transfers on a schedule. This is the right call for V1 (proving correctness before automating), but it should be explicitly staffed/owned, not assumed to "just happen."

### What to change
- **Move coworking desks to category priority #2** (already reflected in `26_ROADMAP.md` §26.2, changed from the brief's original training-room-second ordering) — desks are faster/easier supply to onboard and drive the search-volume density a new marketplace needs to not look empty.
- **Commit to a concrete Maps cost-alert/circuit-breaker** before launch (e.g. a billing alert at a defined dollar threshold that pages someone), not just a documented fallback plan that nobody is watching for the trigger condition.
- **Explicitly staff the manual payout process** with a named owner and a fixed schedule (e.g. every other Friday) rather than leaving it as an ad hoc admin-panel task.

### What's excess for V1 (deliberately trimmed from the brief's fuller ambitions)
- Recurring bookings, calendar two-way sync, corporate accounts, dynamic pricing, AI search, promoted-room boosting (distinct from featured placement) — all correctly deferred to V2/V3 in `26_ROADMAP.md`; none of these block a usable, trustworthy V1 marketplace, and building any of them now would directly work against the low-cost/fast-launch mandate.

### What's missing (gaps this research could not close)
- **No verified Azerbaijan-specific market-sizing data** (§6) — recommend commissioning a small local study or at minimum structured provider/customer interviews (`26_ROADMAP.md` §26.3 already calls for 15–20 provider interviews) before committing marketing budget.
- **No confirmed local AZ SMS aggregator pricing** (`23_COST_MODEL.md` §23.2) — a concrete pre-launch vendor task, not an architecture gap, but one that could materially affect notification-cost assumptions if left unresolved.
- **`.az` domain sourcing** — the only pricing found was an expensive international-reseller quote; a local registrar channel needs to be checked.
- **No professional legal/tax/accounting review has occurred** — repeatedly flagged, genuinely the highest-priority non-engineering gap in this entire plan.
- **No real provider-side validation interviews have been conducted** — the entire market-research section is informed reasoning from comparable markets and public information, not primary AZ research; this document should not be mistaken for validated demand data.

### Database decisions that could cause future problems
- Storing `Room.base_price` as a single value per room is fine for V1 but will need a proper **time-based pricing table** (peak/off-peak, day-of-week variation) before dynamic pricing (V3) — not a blocker now, but worth knowing the current schema is a simplification, not a permanent ceiling.
- The `LedgerEntry`/`Payout` relationship (many-to-many via a nullable `payout_id`) is correct but will need careful indexing attention once payout volume is high — flagged as a watch item for Phase 2 implementation, not a redesign need.

### Payment risks
Covered in depth above and in `13_PAYMENT_ARCHITECTURE.md` — summarized: (1) split-payment mechanics unverified, (2) Payriff's webhook signature scheme is undocumented (mitigated by falling back to an order-lookup confirmation call, `18_SECURITY.md` §18.3), (3) legal/tax treatment unresolved, (4) manual payout process needs real operational ownership.

### Marketplace liquidity, provider acquisition, customer acquisition, chicken-and-egg
Addressed directly and specifically in `26_ROADMAP.md` §26.3 — supply-first strategy, concrete numeric liquidity targets, named provider incentives, and a demand-acquisition sequencing that doesn't spend on marketing before there's anything real to show.

## 37. Missing Requirements (Consolidated List)

1. Local legal/tax/accounting review (payments, commission, provider agreements, invoicing).
2. Local AZ SMS aggregator vendor selection and confirmed pricing.
3. Direct technical conversation with Epoint confirming split-payment settlement mechanics.
4. Local `.az` domain registration channel/pricing check.
5. Primary market research (provider/customer interviews) to validate demand assumptions in `02_MARKET_RESEARCH.md`.
6. A named operational owner for the V1 manual payout process.
7. A Google Maps billing alert/circuit-breaker configured before launch.
8. Final backend/frontend framework confirmation (`27_ADRS.md` ADR-009) — a team/hiring decision, not an architectural blocker.

## 38. RECOMMENDED FINAL ARCHITECTURE

**Product:** Commission-based two-sided marketplace, Baku-first, asset-light (never leases/operates space directly).

**Stack:** Modular monolith (TypeScript/Node recommended, framework TBD per ADR-009) · PostgreSQL 16+ with PostGIS/pg_trgm/tsvector (single instance, no polyglot persistence, no Elasticsearch at V1) · single small Redis instance for cache + job queue · object storage on a zero-egress provider (Cloudflare R2 or Backblaze B2) behind Cloudflare's free CDN · managed PaaS hosting (Render/Railway/Fly.io, VPS as a documented cheaper alternative).

**Payments:** `PaymentProvider` interface, Epoint primary / Payriff secondary, hosted checkout + webhook-confirmed, platform-collects-gross with a separate ledger-driven manual/semi-automated payout process at V1, automation path pre-designed for later.

**Search & Maps:** PostgreSQL-native geospatial + full-text search; Google Maps used narrowly and cost-consciously (autocomplete/geocoding/display only, distance math done free via PostGIS), with a documented open-source fallback if costs grow.

**Multilingual:** Six-locale technical foundation, three-locale (AZ/EN/RU) content activation at launch, translation-key discipline enforced everywhere including transactional messages.

**Trust & Safety:** Admin-gated provider verification, structural fake-review prevention, full financial audit trail, tiered RBAC.

**Monetization:** Configurable booking commission as primary revenue; provider and organizer professional tiers as secondary; clearly labeled featured listings, category sponsorships and event sponsorships as tertiary; partner referral commission is paid from Spotva's own fee, never deducted from provider net.

**Go-to-market:** Supply-first liquidity strategy in Baku alone, sequenced meeting rooms → desks → training rooms → private offices → classroom variants → studios/event spaces, with concrete numeric success milestones before any paid demand-side marketing.

**Estimated cost to run:** ~$10–50/month at launch, ~$100–200/month at early traction, with Google Maps usage as the one metric requiring active monitoring beyond that.

**Hard external dependencies before this can go to code with full confidence:** legal/tax review, Epoint technical confirmation, local SMS vendor selection — everything else in this document is ready for Phase 2 (Database + API Contracts) approval.

---

*This is now a living architecture record. Implemented behavior takes precedence over historical phase-gate wording, and new product domains must be added through explicit, reviewable addenda rather than silent scope expansion.*
