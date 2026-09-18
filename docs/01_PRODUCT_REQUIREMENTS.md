# 01 — Product Requirements

**Working name:** FlexSpace (placeholder codename — final brand name TBD; used consistently across all 27 docs for traceability)
**Tagline:** *Work. Teach. Meet. Create. Anywhere.*
**Status:** Draft for Phase 0/1 approval — no code written against this yet.

## 1.1 Problem Statement

Azerbaijan has real, growing supply of coworking desks, private offices, meeting rooms, training rooms, studios and event spaces — but discovery and booking is fragmented across Instagram DMs, phone calls, WhatsApp groups, and a handful of single-operator booking widgets. There is no trusted, neutral layer where a buyer can compare real-time availability, price and amenities across operators and book in a few clicks, and no standard way for a small operator to reach demand beyond their own social following. This is the same gap LiquidSpace, Peerspace and Worka closed in other markets — none of which serve Azerbaijan today.

## 1.2 Product Definition

FlexSpace is a **two-sided, commission-based marketplace** for booking flexible workspace by the hour, day, or recurring block. It is explicitly **not**:
- a coworking *directory* (no real-time availability or payment = directory, not marketplace)
- a classifieds/listing board (no booking engine, no trust layer = classifieds)
- a single coworking brand's booking widget (single-supply, not a marketplace)

It **is** a search → compare → book → pay pipeline across many independent operators, unified by one booking engine, one payment/commission layer, and one trust layer (verification + reviews).

## 1.3 Space Categories (V1 scope)

| # | Category | Priority | Notes |
|---|---|---|---|
| 1 | Meeting room | P0 | Highest hourly-rental demand pattern globally (see 02/03) |
| 2 | Training room | P0 | High demand in AZ (corporate training, exam prep, courses) |
| 3 | Coworking desk (hot desk / dedicated) | P0 | Core discovery driver, lowest price point, highest search volume |
| 4 | Private office (short-term) | P0 | Higher ACV, appeals to small teams/freelancers |
| 5 | Classroom | P1 | Overlaps operationally with training room; same schema, different label |
| 6 | Business meeting room | P1 | Modeled as a meeting-room subtype with a "formal/boardroom" tag, not a separate entity |
| 7 | Tutor/teacher room | P1 | Small-capacity variant of classroom; important for 1:1 tutoring market |
| 8 | Interview room | P1 | Small-capacity meeting room subtype; HR-specific amenity tags (privacy, soundproofing) |
| 9 | Workshop space | P2 | Larger footprint, equipment-heavy; closer to event space |
| 10 | Seminar room | P2 | Mid-large capacity training room variant |
| 11 | Conference room | P1 | Larger meeting room variant |
| 12 | Podcast/content studio | P2 | Niche but zero direct AZ competitor; equipment-list-heavy |
| 13 | Photo/video studio | P2 | Same as above |
| 14 | Event space | P2 | Longer bookings, higher price, different cancellation policy needs |

**Design decision:** these are not 14 separate database entities. They are **RoomType** values on a single `Room` entity, grouped into a small number of structural "shapes" (see `09_DOMAIN_MODEL.md`) that share the same availability/booking/pricing mechanics but differ in default capacity ranges, default amenities, and search-facet weighting. This keeps the schema simple and lets new categories (e.g. "recording booth") be added by inserting a taxonomy row, not a migration.

## 1.4 Core Search Requirement

A user must be able to express, in one search action:

`Location → Date → Time → Duration → Participants → Purpose → Budget → Amenities`

and receive results ranked by a blended score of **availability, price, distance, rating, amenities match, and capacity fit** (see `16_SEARCH_ARCHITECTURE.md` for the scoring formula). This is the single most important functional requirement in the product — if this doesn't work reliably, nothing else matters.

## 1.5 Non-Functional Requirements

| Requirement | Target | Rationale |
|---|---|---|
| Double-booking rate | 0% | Non-negotiable — see `12_RESERVATION_ENGINE.md` |
| Search response time | < 500ms server-side at V1 scale | PostgreSQL-first architecture must hit this without a search engine |
| Mobile usability | Full feature parity, mobile-first layout | Majority of AZ web traffic is mobile |
| Uptime | 99.5% V1 (not 99.99% — over-engineering for stage) | Matches "low infra cost" constraint |
| Initial infra spend | Low tens of USD/month at launch, low hundreds at meaningful traffic | See `23_COST_MODEL.md` |
| Time-to-first-booking (new customer) | Browse → book without forced registration until payment step | See `05_USER_FLOWS.md` |
| Language coverage | AZ/EN/RU/TR/DE/ES technically supported day one; AZ/EN/RU content-active at launch | See `20_I18N.md` |
| Payment compliance | PCI scope minimized via hosted checkout (no raw card data touches our servers) | See `13_PAYMENT_ARCHITECTURE.md` |

## 1.6 Explicit Out-of-Scope for V1

Real-time chat between customer/provider, AI natural-language search, dynamic/surge pricing, corporate budget/policy engine, calendar system integrations (Google/Outlook two-way sync), native mobile apps, recurring-booking automation, provider staff scheduling/shift tools. All of these are named in `26_ROADMAP.md` as V2/V3 and their absence does not block a usable V1 marketplace.

## 1.7 Success Criteria for V1 Launch (Baku)

- ≥ 50 verified, bookable listings live across ≥ 4 categories before public marketing spend begins (see `26_ROADMAP.md` liquidity strategy)
- A customer can go from homepage to confirmed, paid booking in ≤ 4 screens
- Zero double-bookings in the first 90 days
- Provider payout reconciliation is auditable to the qəpik (ledger balances to zero every settlement cycle)
