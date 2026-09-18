# 23 — Monthly Cost Model

All figures sourced from live provider pricing pages (Sept 2026 research pass) unless marked **[verify]** — meaning pricing is volatile, was hard to fetch reliably, or should be re-confirmed locally before committing budget. Figures are USD unless noted; treat every number here as a planning estimate, not a quote.

## 23.1 Traffic Scenario Definitions

| Scenario | Rough shape |
|---|---|
| **LOW** | Pre-launch / early launch — a few hundred site visits/mo, < 50 active listings, < 50 bookings/mo |
| **MEDIUM** | Early traction — a few thousand visits/mo, ~200–500 active listings, a few hundred bookings/mo |
| **HIGH** | Real marketplace liquidity in Baku — tens of thousands of visits/mo, 1,000+ active listings, 1,000+ bookings/mo |

## 23.2 Monthly Cost Table

| Category | LOW | MEDIUM | HIGH | Notes |
|---|---|---|---|---|
| App hosting | $7–20 (Render Starter/Railway Hobby) | $25–40 (Render Standard) | $85–150+ (Render 4GB/2CPU or multi-instance) | PaaS pricing; VPS (Hetzner/DO) alternative ~30–50% cheaper but unmanaged |
| Managed PostgreSQL | $0–19 (free/entry tier) | $25–61 (Supabase Pro / DO 2vCPU-4GB) | $122+ (DO 4vCPU-8GB or Neon Scale metered) | Managed, with automated backups — not a place to cut cost |
| Redis (job queue + cache) | $0 (small free tier or bundled) | ~$10–15 (small managed instance) | ~$30–50 | Single small instance throughout V1; no cluster |
| Object storage (photos) | ~$0 (within R2/B2 free tier) | $1–5 (storage) + $0 egress (R2/B2) | $10–30 (storage) + $0 egress | **Zero-egress providers (R2/B2) chosen specifically to avoid the S3-style egress cost spike** as photo views scale |
| CDN | $0 (Cloudflare Free) | $0 | $0 (Free tier covers this; Enterprise only relevant at very high scale) | |
| Google Maps Platform | $0 (within free per-SKU allowance) | ~$390 **[verify]** (est. 20K map loads + 20K autocomplete + 10K geocodes/mo at pay-as-you-go rates) | Scales linearly — can become the **single largest line item** without active management | See `15_MAPS_ARCHITECTURE.md` cost-containment measures; MapLibre/OSM fallback named as an exit ramp if this grows unmanageably |
| Transactional email | ~$0 (Resend free tier, <3K/mo) | $5–20 (SES cheapest, Resend Pro for DX) | $10–90 (SES scales best; Resend Scale $90 flat) | SES is the cost-optimal choice at real volume |
| SMS | Low single-digit $ (few hundred transactional SMS) | **[verify locally]** — do not budget off Twilio's ~$0.41/msg to AZ; a local aggregator should be materially cheaper | Scales with booking volume; local sourcing is the single biggest lever here | Flagged explicitly in `17_NOTIFICATION_ARCHITECTURE.md` as a pre-launch vendor task |
| Payment provider fees | 3% (Epoint cards) + 3.5% (Apple/Google Pay) of transaction volume | same % | same % | Not a fixed monthly cost — scales with GMV; not "infrastructure" but material to unit economics |
| Error monitoring (Sentry) | $0 (Developer/Free tier) | $26 (Team) | $80 (Business) | |
| Domain | ~$10–20/yr generic TLD; **[verify locally]** for `.az` — international resellers quote $500+/yr, a local AZ registrar/AzNIC channel is very likely far cheaper | same | same | Do not budget the $500+/yr figure without checking a local channel first |
| Backups (beyond DB provider's bundled backups) | $1–5 | $3–8 | $5–15 | Mostly redundant with managed-Postgres bundled backups; incremental cost for extra retention/off-provider copies |
| **Estimated total (excl. payment-processing %, excl. Maps at HIGH)** | **~$10–50/mo** | **~$100–200/mo** | **~$300–500+/mo** (before Maps growth) | |

## 23.3 The One Line Item That Can Surprise You: Google Maps

Every other category in this table scales gracefully and predictably. Google Maps Platform pricing does not — it scales directly with page views (map loads) and address lookups (autocomplete sessions), both of which grow with *traffic*, not with catalog size or bookings. At HIGH traffic, unmanaged Maps usage could plausibly become larger than every other infrastructure line combined. This is why `15_MAPS_ARCHITECTURE.md` treats Maps cost-containment (lazy loading, geocode-once-and-cache, session tokens, a documented MapLibre/OSM fallback) as an architectural requirement, not a nice-to-have — and why this cost model calls it out by name rather than burying it in a single row.

## 23.4 What Scales With Revenue, Not With Infrastructure

Payment processing fees (3%/3.5% per `13_PAYMENT_ARCHITECTURE.md`) are the largest *percentage-of-GMV* cost but are not an infrastructure cost in the traditional sense — they only exist when a transaction happens, and are already accounted for in the ledger model (`14_PAYOUT_LEDGER.md`) as `PROCESSING_FEE`. They should be modeled against commission revenue in the business model (`00_RECOMMENDED_FINAL_ARCHITECTURE.md` §Marketplace Economics), not against the fixed monthly infra budget above.

## 23.5 Bottom Line for Founder Planning

A working V1 can realistically launch and run for **roughly $10–50/month** in pure infrastructure at pre-liquidity traffic, growing to a still-modest **~$100–200/month** once there's real (but early) traction, with **Google Maps usage as the one variable to actively monitor** past that point. This is consistent with — and validates — the brief's mandate that a modular monolith + PostgreSQL + object storage + CDN approach keeps launch costs low without needing to compromise on functionality (real availability, real payments, real search) to get there.

## Sources

Pricing figures drawn from: [Render](https://render.com/pricing) · [Railway](https://railway.com/pricing) · [Fly.io](https://fly.io/docs/about/pricing/) · [Hetzner Cloud](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/) · [DigitalOcean Droplets](https://www.digitalocean.com/pricing/droplets) · [DigitalOcean Managed DB](https://www.digitalocean.com/products/managed-databases-postgresql) · [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) · [Neon](https://neon.com/pricing) · [Supabase](https://supabase.com/pricing) · [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) · [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) · [Cloudflare Plans](https://www.cloudflare.com/plans/) · [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/) · [Google Maps Billing FAQ](https://developers.google.com/maps/billing-and-pricing/faq) · [Amazon SES](https://aws.amazon.com/ses/pricing/) · [Resend](https://resend.com/pricing) · [Postmark](https://postmarkapp.com/pricing) · [Twilio SMS to Azerbaijan](https://www.twilio.com/en-us/sms/pricing/az) · [Sentry](https://sentry.io/pricing/) · [101domain .az](https://www.101domain.com/az.htm) · Payment fees per [Epoint Terms](https://epoint.az/en/terms).

**Explicitly flagged as needing re-verification before budgeting:** Hetzner exact current tier prices (mid-2026 price adjustment in progress), AWS S3 exact per-GB table, current SendGrid tiers, Vonage AZ-specific SMS rate, `.az` domain price via a local registrar/AzNIC rather than an international reseller, and — critically — a local AZ SMS aggregator's real per-message rate.
