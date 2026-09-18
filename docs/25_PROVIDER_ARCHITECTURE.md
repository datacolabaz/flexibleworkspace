# 25 — Provider Architecture & Pricing Tiers

## 25.1 Provider Dashboard Scope

Locations · Rooms · Pricing · Availability · Bookings · Calendar · Revenue · Payouts · Reviews · Analytics · Photos · Amenities · Staff · Promotions — per `06_INFORMATION_ARCHITECTURE.md` §6.2. Calendar view (month/week, color-coded available/booked/blocked, per `08_DESIGN_SYSTEM.md` §8.2) is treated as a core, not secondary, feature — it's the screen a provider will open most often.

## 25.2 Plan Tiers — Recommendation With Reasoning

The brief explicitly asked not to have limits invented blindly. The numbers below are derived from three inputs: (a) the actual per-unit cost drivers identified in `23_COST_MODEL.md` (photo storage/CDN, SMS/notification volume, support burden of staff accounts and API access), (b) what reference marketplaces gate behind paid tiers (analytics, featured placement, staff seats are consistently paid-tier features across SaaS-adjacent marketplace products), and (c) the explicit goal stated in the brief: **FREE must be generous enough to create real marketplace supply, without exposing the platform to unbounded storage/support cost per free provider.**

| Limit | FREE | STARTER | PRO | ENTERPRISE | Reasoning |
|---|---|---|---|---|---|
| Locations | 1 | 1 | up to 5 | Unlimited | A single-location owner (the majority of early AZ supply, persona P5) fits FREE completely; multi-location (P6) is precisely the profile willing to pay, since they're already running a real business across branches |
| Rooms/listings | 3 | 10 | 50 (soft cap, raise on request) | Unlimited | 3 rooms covers a small coworking space's core inventory (e.g. one meeting room + one training room + desks-as-one-listing) — enough to be genuinely useful, not enough to let a large operator run their whole business for free indefinitely |
| Photos per room | 5 | 15 | 30 | Unlimited (soft cap) | Photos are the single largest per-provider storage/CDN cost driver (`23_COST_MODEL.md`) — capping this directly caps the platform's marginal cost per free provider, while 5 photos is still enough to make a listing look credible |
| Staff accounts | 0 (owner only) | 2 | 5 | Unlimited | Staff accounts add auth/support surface area (password resets, permission confusion, support tickets) — gating this matches the real cost driver, not an arbitrary SaaS convention |
| Bookings/month | Unlimited | Unlimited | Unlimited | Unlimited | **Deliberately not limited by plan tier at any level.** Booking volume is the platform's own revenue driver (commission) — throttling it would be self-defeating. Cost scales with bookings mainly through notifications (email/SMS), which is a platform-wide cost lever (`17_NOTIFICATION_ARCHITECTURE.md`), not something to solve by penalizing successful providers |
| Analytics | None (basic view-count only) | Basic (views, booking conversion) | Advanced (occupancy, revenue trends, search-appearance detail) | Advanced + custom reporting | Analytics computation is cheap at V1 scale but is the single most consistently paid-tier feature across every reference marketplace/SaaS product researched — a legitimate, low-controversy upsell |
| Featured placement | None | None | Included credits + purchasable | Included credits + purchasable | Featured placement is a direct monetization lever (`25.4`) as much as a plan perk — makes sense to gate to paying tiers |
| Calendar/iCal export | — | ✅ | ✅ | ✅ + two-way sync (V2) | Low engineering cost, meaningful convenience — a reasonable STARTER-tier differentiator |
| Recurring bookings (provider side) | — | — | ✅ (V2 feature, once built) | ✅ | Recurring-booking automation is itself a V2 build (`26_ROADMAP.md`) — tier-gating is forward-declared here for consistency, not implying V1 scope |
| API access | — | — | — | ✅ | API access is an infrastructure-load and support-surface commitment appropriate only for the highest tier / negotiated enterprise relationships |
| Support | Community/self-serve (help center) | Priority email | Priority email + faster SLA | Dedicated account contact | Support staff time is a real cost (`23_COST_MODEL.md` doesn't price this directly, but it's a genuine operational cost) — tiering response priority is standard and doesn't leave FREE providers unsupported, just not prioritized |

**Explicit design intent:** FREE is generous on the dimension that creates marketplace supply (listing itself, unlimited bookings/revenue) and constrained on the dimensions that create platform cost (photos/storage, staff seats) — this is the direct implementation of the brief's "free plan should create supply without loading the platform with storage/API/support cost" instruction.

## 25.3 API & Rate Limits

Public/partner API access (as opposed to the dashboard's own internal API calls, which aren't tier-gated since they're how a provider uses the product at all) is an ENTERPRISE-tier feature, rate-limited per API key, and is a V2/V3 concern in practice — no external partner integrations are expected to need this at V1 launch, so it is named here for completeness of the tier table but not built until an actual enterprise customer needs it.

## 25.4 Alternative/Additional Revenue Models (beyond commission)

Evaluated per the brief's explicit request:

| Model | V1 fit | Reasoning |
|---|---|---|
| Commission per booking | **Yes — primary V1 revenue model** | Matches marketplace liquidity needs (`03_COMPETITOR_ANALYSIS.md` synthesis) — zero cost to unengaged providers, scales with actual value delivered |
| Monthly subscription (plan tiers) | **Yes — secondary V1 revenue model** | Captures value from providers who want more capacity/analytics regardless of booking volume; also smooths revenue since commission alone is volatile early on |
| Featured listing / sponsored placement | **Yes — V1, low-effort to build** | Direct, well-understood monetization (homepage "Featured spaces," boosted search position within relevance constraints — never overriding actual availability/relevance so much that it breaks trust) |
| Promoted room (pay-per-boost within search results, distinct from homepage featured) | Defer to V1.1 | Same mechanism as featured placement, minor variant — sequence after featured placement ships and is validated |
| Premium analytics | **Yes — bundled into STARTER/PRO tiers**, not sold standalone | Simpler pricing story for a market with no existing mental model for a la carte analytics add-ons |
| Booking automation (recurring bookings, calendar sync) | Defer to V2 | Real feature work required (`26_ROADMAP.md`); not a V1 monetization lever |
| Corporate tools (budgets, approval workflows) | Defer to V2/V3 | Requires the `Company/Employee/Budget` domain extension (`09_DOMAIN_MODEL.md` §9.4) not built in V1 |

**V1 revenue model recommendation: commission (primary) + subscription tiers (secondary) + featured placement (tertiary, low-effort).** This combination gives the lowest initial cost/complexity while creating multiple, independent revenue levers that don't depend on each other working perfectly — consistent with the brief's stated priority of low initial cost + low infra cost + fast marketplace growth over revenue-maximization in year one.

## 25.5 Provider Trust Signals (Beyond Verification Badge)

Response rate/time to booking requests (once any provider-side confirmation step exists — note V1's booking flow is instant-book, not request-based, so this applies more once a request-based flow exists for high-value/event-space bookings, a plausible V1.1 addition per category), review rating and count, cancellation rate — all surfaced on the provider's public profile to help customers self-select trustworthy providers, and all feeding into `24.2`'s admin suspension signal, without needing a human to manually monitor every provider constantly.
