# 02 — Market Research

## 2.1 Why Azerbaijan, Why Now

Baku has a growing base of independent coworking operators, business-centre meeting rooms, private training/education centres, and a nascent content-creator economy (podcast/photo studios) — but discovery is entirely informal (Instagram, Facebook groups, word of mouth, direct calls). This is the same pre-marketplace condition every reference market (US pre-LiquidSpace, global pre-Peerspace) was in before an aggregator emerged. No dedicated, neutral, multi-operator hourly-booking marketplace serving these categories currently operates in Azerbaijan at the time of this research (see `03_COMPETITOR_ANALYSIS.md` — Worka lists Baku centres but is IWG's own global enterprise-skewed platform, not a locally-optimized consumer/SMB marketplace).

## 2.2 Demand-Side Signals (qualitative, to be validated with real supply-side interviews before launch)

- **Corporate training & exam prep**: Azerbaijan has an active training/certification market (language schools, professional certification, university-adjacent tutoring) that regularly needs short-term classroom/training-room rental — currently solved ad hoc via personal networks or renting entire business-centre floors.
- **SME meeting needs**: Small and micro businesses without a leased office regularly need a professional room for client meetings/interviews — currently often defaulting to cafés, which is a known weak substitute (noise, no privacy, no AV equipment).
- **Freelance/remote work growth**: Regional remote-work growth (contractors serving EU/US/Turkish clients) creates desk-by-the-day demand not tied to a monthly coworking membership.
- **Content creator economy**: A small but real and underserved market for hourly podcast/photo/video studio rental — zero dedicated marketplace exists for this in AZ today.

**This is qualitative market reasoning, not verified survey data.** Before committing paid marketing spend, the roadmap (`26_ROADMAP.md`) calls for direct interviews with 15–20 prospective providers across categories to validate real booking-frequency assumptions.

## 2.3 Regional Expansion Logic

| Market | Why it's a logical next step | Timing signal |
|---|---|---|
| Georgia (Tbilisi/Batumi) | Similar informal-supply market structure, strong digital-nomad inflow, geographic/cultural proximity, shared regional payment-rail learnings | V2, once AZ unit economics and ops playbook are proven |
| Turkey | Much larger addressable market, but higher competitive intensity (Worka/IWG already active, more mature local players) — enter only with a proven playbook | V2/V3 |
| EU (starting with a smaller market, e.g. Baltics) | Tests the multi-currency/multi-language architecture built in V1 without AZ-specific payment assumptions | V3 |

This ordering is why the architecture (`22_INFRASTRUCTURE.md`, `20_I18N.md`, `13_PAYMENT_ARCHITECTURE.md`) is built multi-currency/multi-locale/multi-payment-provider from day one even though only AZN + AZ/EN/RU are "switched on" at launch — retrofitting this later is materially more expensive than building it in from the start, which is the one place in this plan where a small amount of "build for scale" complexity in V1 is justified rather than overengineering.

## 2.4 Local Constraints That Shape the Architecture

- **Payment rails**: No AZ-based provider offers a mature, fully-verified marketplace split-payment product (see `13_PAYMENT_ARCHITECTURE.md`); Stripe Connect is not usable for an AZ-domiciled entity. This is why the payment architecture defaults to "collect gross, compute ledger, pay out separately" rather than assuming automatic split settlement.
- **Trust deficit**: In an informal market, the platform's core value-add is *trust* (verified operators, real availability, clear cancellation policy) at least as much as convenience — this elevates `24_ADMIN_ARCHITECTURE.md` verification workflow and `18_SECURITY.md` from "nice to have" to core V1 scope.
- **Price sensitivity**: AZN price points are materially lower than US/EU comparables; infrastructure cost (`23_COST_MODEL.md`) must stay low enough that a modest commission on modest AZN transaction sizes still covers platform costs at low volume.
- **Mobile-first usage**: Consistent with broader regional mobile-internet usage patterns, the product must treat mobile as the primary surface, not a responsive afterthought (`07_UX_ARCHITECTURE.md`).

## 2.5 Risks Specific to This Market

- Low initial search volume means SEO alone won't generate liquidity for months — direct provider/customer acquisition (`26_ROADMAP.md`) has to substitute for organic discovery in the first 2–3 months.
- Card-payment trust and adoption vary by demographic; the product should not assume card-only payment forever, though V1 architecture starts card-first via hosted checkout for engineering simplicity (cash-on-arrival/bank-transfer fallback is a documented V2 option, not built now).
- Legal/tax treatment of marketplace commission and provider payouts in Azerbaijan needs dedicated legal/accounting review before commission percentages and invoicing are finalized — flagged again in `13_PAYMENT_ARCHITECTURE.md` and `26_ADRS.md` as a hard dependency, not something this document can resolve.

## Sources

Qualitative reasoning in this document draws on the reference-market research in `03_COMPETITOR_ANALYSIS.md` and the payment-rail findings in `13_PAYMENT_ARCHITECTURE.md`. No Azerbaijan-specific market-sizing data source was available to this research pass — market sizing (TAM/SAM/SOM figures) is explicitly flagged as a gap in `00_RECOMMENDED_FINAL_ARCHITECTURE.md` §"Missing Requirements" and should be commissioned as a follow-up local study before large marketing investment.
