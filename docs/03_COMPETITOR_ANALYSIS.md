# 03 — Competitor Analysis (Global Reference Models)

Researched with live web sources (Sept 2026). Full source list at the bottom. This document informs, but does not get copied into, the product design — see the "V1 takeaway" line under each product.

## 3.1 LiquidSpace (US)

Marketplace aggregating desks, private offices and meeting rooms from independent operators; 3,500+ cities; free-to-list, small booking-percentage fee (exact % undisclosed). Now leans heavily into an enterprise hybrid-work real-estate management product layered on top of the original consumer booking flow.

- **Good:** simple free-listing + pay-per-booking model; mature multi-operator aggregation; strong enterprise trust layer.
- **Problems:** user complaints cluster on deposit/refund handling (deposits held months, refund processed via PayPal with fee deductions) — a payments/ops trust failure, not a product-market fit failure.
- **V1 fit:** Borrow the free-to-list + booking-fee structure and the plain search→book→pay flow. **Defer** the enterprise real-estate portfolio/analytics product to V2/V3.

## 3.2 Deskpass (US)

Originally a subscription "visit credits" model; has since split into **Deskpass Teams** (corporate flexible-workspace budget) and **Deskpass Instant Workspace** (pay-as-you-go, no subscription). Merged with Industrious-owned Breather in 2024, adding meeting-room inventory.

- **Good:** the B2B "Teams" flexible-budget product is a durable, sticky revenue line once there's a corporate customer base.
- **Problems:** the pivot away from pure consumer subscription signals the original hour-bank model had supply/demand-matching issues — a fixed-fee member can over-use a popular space relative to what the host is compensated, and hosts can be delisted, creating inconsistent member-facing availability.
- **V1 fit:** Borrow the *concept* of a later B2B budget product (`26_ROADMAP.md` V2). **Defer** any subscription/credits model — it needs dense multi-operator supply Azerbaijan won't have on day one.

## 3.3 Worka (IWG/Instant Group)

Not a small indie app — **Worka is the global marketplace brand created by IWG (owner of Regus/Spaces) merging with The Instant Group** in 2022; 30,000+ locations, 10,000+ cities, **Baku is already listed**. Skews toward enterprise "workspace-as-a-benefit" programs on top of IWG's own centre network plus independent operators. IWG has reportedly shopped a ~50% stake in Worka.

- **Good:** proves the exact end-state concept ("one booking layer across many independent operators + enterprise programs") already works and already has a toehold in Baku.
- **Problems:** majority-owned by the largest incumbent landlord — independent hosts may reasonably suspect the marketplace favors IWG's own brands; corporate ownership has been in flux.
- **V1 fit:** This is the closest existing "competitor" in Baku by name recognition, but it is **enterprise-skewed and incumbent-owned**, leaving room for a **locally-neutral, SMB/individual-friendly, AZN-priced, AZ-language-first** alternative. Don't try to out-enterprise Worka; win on being the trusted neutral local layer for independent operators and everyday bookers.

## 3.4 Croissant

Hour-bank membership network (Explorer/Creator/Luminary tiers) giving walk-in access to 800+ partner spaces, no reservation required.

- **Good:** low-friction discovery/try-before-you-commit UX.
- **Problems:** same hour-bank tension as Deskpass's original model — hosts compensated per walk-in hour rather than per confirmed booking, creating crowding/under-visitation imbalances.
- **V1 fit:** **Defer entirely.** Requires dense multi-operator supply and usage-reconciliation infrastructure Azerbaijan won't have at launch. The check-in/check-out UX pattern is worth revisiting only after a subscription product is justified (V2+).

## 3.5 Category-Specific Comparables

| Product | Segment | Model | Verified fee |
|---|---|---|---|
| **Peerspace** | Event/photo/video studios, meeting spaces, hourly | Pure marketplace | **20% host service fee** + variable guest processing fee |
| **Giggster** | Film/photo locations, event spaces | Pure marketplace | **19% host commission** + variable guest fee |
| **Breather** (defunct as standalone) | Private hourly meeting rooms/offices | Started as *leased inventory* → insolvent Dec 2020 (~$120M burned) → converted to pure marketplace under Industrious → merged into Deskpass 2024 | N/A |
| **WeWork On Demand** | Desks/offices/meeting rooms | Pay-as-you-go layer over WeWork's own leased buildings | Not disclosed |

- **Peerspace/Giggster** are the strongest structural analogs for the studio/event/training-room categories in this product — transparent at-booking fee disclosure and spec-heavy filtering (equipment, capacity, parking) are both directly reusable UX patterns (see `07_UX_ARCHITECTURE.md`, `16_SEARCH_ARCHITECTURE.md`).
- **Breather is the cautionary tale that most directly validates this project's "no leased inventory" constraint**: leasing/operating space directly is what bankrupted it; the asset-light marketplace model is the only version that survived. This is why `22_INFRASTRUCTURE.md` and this entire architecture assume **FlexSpace never holds real-estate risk** — it only ever holds a payments ledger.
- **Robin/Skedda/Envoy**-style tools are internal workplace room-booking SaaS, not public marketplaces — relevant only as a possible *provider-side* calendar-integration target in V2, not a competitor.

## 3.6 Model Synthesis — What FlexSpace Should Actually Be in Year 1

**A pure commission marketplace**, not a subscription/hour-bank network. Reasoning:

1. Subscription/hour-bank models (Deskpass's original form, Croissant) require dense, multi-operator supply already in place to keep host compensation fair — Azerbaijan starts with a handful of hosts per city.
2. The asset-light marketplace pattern (LiquidSpace, Peerspace, Giggster, and Breather's *post*-bankruptcy form) keeps infrastructure cost near zero — no leases, no owned inventory — matching the explicit low-infra-cost mandate.
3. Free-to-list + commission-on-transaction (as LiquidSpace, Worka, Peerspace and Giggster all do) removes supply-side friction: hosts have no reason not to join, and the platform only earns when a real transaction clears.

**Starting commission recommendation:** a **10–15% platform commission**, configurable per provider/category (see `24_ADMIN_ARCHITECTURE.md`, `13_PAYMENT_ARCHITECTURE.md`), deliberately undercutting the two verified global comparables (Peerspace 20%, Giggster 19%) to accelerate early host acquisition in a market with zero brand trust yet. This is a judgment call informed by the comparables, not itself a sourced industry-standard figure, and should be revisited once real AZ unit economics are known.

**One thing worth pre-building, not now:** a lightweight B2B "flexible workspace budget" product (Deskpass Teams / Worka's enterprise layer) once 5–10 corporate accounts are booking regularly in Baku — see `26_ROADMAP.md` V2.

## Sources

- [LiquidSpace — How it Works](https://liquidspace.com/how-it-works) · [FAQ](https://liquidspace.com/faq) · [Wikipedia](https://en.wikipedia.org/wiki/LiquidSpace) · [Reviews](https://www.pissedconsumer.com/liquidspace/RT-F.html)
- [Deskpass — How It Works](https://hub.deskpass.com/how-does-deskpass-work) · [Pricing](https://hub.deskpass.com/how-much-does-it-cost) · [Space availability note](https://www.deskpass.com/resources/getting-started/why-is-a-space-no-longer-available-on-deskpass) · [Deskpass/Breather merger](https://www.businesswire.com/news/home/20240213676670/en/Deskpass-and-Industrious-owned-Breather-Announce-Merger-to-Expand-Global-Network-of-Flexible-Workspaces)
- [Worka — homepage](https://www.worka.com/en) · [Worka Baku](https://www.worka.com/en/locations/azerbaijan/baki) · [Instant Group/IWG merger announcement](https://www.theinstantgroup.com/en-us/news/instant-creates-the-largest-independent-global-marketplace-for-flexible-workspace/) · [IWG stake-sale reporting](https://allwork.space/2023/03/digest-iwg-considers-800m-deal-for-digital-platform-worka/)
- [Croissant — How it Works](https://help.getcroissant.com/en/articles/381862-how-does-croissant-work) · [Forbes review](https://www.forbes.com/sites/sethporges/2017/09/21/a-review-of-croissant-can-the-classpass-for-coworking-spaces-change-the-way-we-work/)
- [Peerspace service fee](https://support.peerspace.com/en/articles/10119442-what-is-the-peerspace-service-fee) · [Peerspace fee terms](https://www.peerspace.com/legal/terms/fees-overview)
- [Giggster commission](https://help.giggster.com/en/articles/2832062-how-much-commission-does-giggster-take)
- [Breather — Wikipedia](https://en.wikipedia.org/wiki/Breather_(company)) · [Forbes on Breather's collapse](https://www.forbes.com/sites/noahkirsch/2020/12/18/the-end-of-coworking-breathers-demise-closes-a-terrible-year-for-flexible-office-space/)
- [WeWork On Demand](https://www.wework.com/ideas/workspace-solutions/flexible-products/what-is-wework-on-demand-and-how-does-it-work)
