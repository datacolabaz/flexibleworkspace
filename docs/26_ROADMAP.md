# 26 — Roadmap & Go-to-Market Strategy

## 26.1 Scope by Phase

**V1 (launch):** multilingual foundation (AZ/EN/RU/TR/DE/ES infra, AZ/EN/RU content-active) · homepage · search · filters · map · listing/room detail · availability · booking · payment (Epoint primary, Payriff backup adapter) · customer account · provider account & dashboard · admin panel · reviews · verification · basic analytics · SEO foundation.

**V2:** recurring bookings · calendar integrations (one-way iCal export → later two-way sync) · advanced notifications (WhatsApp, push once a mobile app exists) · promotions/coupons · provider subscriptions (already modeled in V1 domain, tier enforcement/billing built out) · corporate accounts (Company/Employee/Budget) · invoices at scale · deeper analytics · provider staff (already modeled, permission granularity expanded) · payout automation (Epoint split-payment if confirmed viable, or bank-transfer-API automation).

**V3:** AI-assisted natural-language search (translating free text into structured filters, sitting on top of the same deterministic search engine — never inventing availability/pricing itself, `16_SEARCH_ARCHITECTURE.md`) · international expansion (Georgia, Turkey, EU) · dynamic pricing suggestions for providers · recommendation engine · corporate marketplace/RFP tools · advanced booking automation.

Nothing above is scope creep into V1 — this phased list exists precisely so V1 stays disciplined: every feature not listed under V1 explicitly does not block a usable, trustworthy launch.

## 26.2 Geographic & Category Sequencing

**Geography: Baku first, exclusively**, before any other Azerbaijani city — concentrating early supply/demand effort in one city is what creates the density needed for the marketplace's core promise (real availability, real choice) to actually be true for a user's first search. Ganja/regional AZ expansion happens only once Baku has enough listings per category that a search rarely returns zero/one result.

**Category sequencing — re-evaluated against demand logic, not just re-stated from the brief:**

| Priority | Category | Why this order |
|---|---|---|
| 1 | Meeting rooms | Highest-frequency, lowest-friction booking pattern (short duration, repeat use by SMEs/freelancers) — the fastest path to proving the core booking loop works |
| 2 | Coworking desks | Second-highest frequency, lowest price point — good top-of-funnel category for search volume and habit formation, and typically the easiest supply to onboard (most existing coworking spaces already have desk inventory ready to list) |
| 3 | Training rooms | Real, validated demand signal (`02_MARKET_RESEARCH.md`) but lower frequency per customer than meeting rooms/desks (a training provider books a block, not daily) — still core to V1 categories, sequenced third because it benefits from the trust/liquidity the first two categories build |
| 4 | Private offices | Higher price point/lower frequency — valuable for revenue per booking but not a volume driver; benefits from being listed once there's already traffic from categories 1–2 |
| 5 | Classrooms / tutor rooms / interview rooms | Structural variants of training/meeting rooms (`01_PRODUCT_REQUIREMENTS.md` §1.3) — effectively "free" to support once categories 1 and 3 exist, since they share the same schema and search mechanics |
| 6 | Studios (podcast/photo/video) & event/workshop spaces | Real underserved niche with zero direct AZ competitor, but lower search volume and more spec-heavy discovery needs (`03_COMPETITOR_ANALYSIS.md` Peerspace/Giggster comparison) — worth including from day one for differentiation, but not the categories to lead marketing messaging with until 1–3 have proven the core loop |

This re-prioritizes the brief's original ordering slightly: **coworking desks are moved up to #2** (ahead of training rooms) because desk inventory is typically the easiest and fastest supply to onboard from existing coworking operators, and low-price/high-frequency search volume is exactly what a brand-new marketplace needs to generate enough activity to look "alive" in its first weeks — an empty-feeling marketplace is worse for trust than a narrow one.

## 26.3 Solving Chicken-and-Egg: Which Side First?

**Supply first, deliberately, before any demand-side marketing spend.** A marketplace with demand and no supply produces a broken, trust-destroying first impression (search returns nothing); a marketplace with supply and no demand yet is just an inconvenience for a provider who listed for free and is waiting — recoverable, not fatal. Concretely:

1. **Manually recruit ≥ 50 verified listings across ≥ 4 categories in Baku before any paid customer acquisition begins** (`01_PRODUCT_REQUIREMENTS.md` §1.7 success criterion) — this is a founder/ops-led, high-touch process (direct outreach to known coworking spaces, training centers, business centers), not something to wait on organic provider signup for.
2. **Provider acquisition incentives** (evaluated per the brief):
   - **Free listing** — already the default (`25_PROVIDER_ARCHITECTURE.md` FREE tier), removes the biggest objection.
   - **Reduced/promotional commission for early adopters** (e.g. a time-boxed lower rate for the first cohort, `13_PAYMENT_ARCHITECTURE.md` §13.5 / `24_ADMIN_ARCHITECTURE.md` §24.5) — directly rewards the providers taking on trust risk with an unproven platform.
   - **Featured placement at no charge for early cohort** — gives first movers real visibility benefit while the platform has near-zero paid-placement inventory competition anyway.
   - **Hands-on onboarding assistance** (helping a non-technical owner like persona P5 photograph and list their space) — likely the single highest-leverage, lowest-cost lever for a market where many providers currently manage bookings by phone/Instagram and aren't going to self-serve through a signup form unassisted.
3. **Demand-side acquisition, once real supply exists**, leans on: SEO foundation already built for V1 (`19_SEO.md`), direct outreach to identified demand personas (freelancer communities, corporate training providers, SME networks), and only then paid channels — paid demand acquisition before supply exists would be pure waste.

## 26.4 Success Milestones

| Milestone | Target |
|---|---|
| Supply floor reached | ≥ 50 verified listings, ≥ 4 categories, Baku |
| First paid booking processed end-to-end (search → pay → payout) | Before any public marketing announcement |
| Liquidity signal | A search for the top 2 categories in central Baku districts returns ≥ 3 relevant results at any reasonable time/date |
| Repeat usage signal | ≥ 20% of confirmed bookings are from a returning customer within 90 days of launch |
| Provider retention signal | ≥ 80% of onboarded providers still active (not churned/delisted) after 90 days |
