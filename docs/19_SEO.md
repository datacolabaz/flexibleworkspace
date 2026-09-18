# 19 — SEO Architecture

## 19.1 SEO Is a Launch Requirement, Not a Later Optimization

For a new marketplace with no brand recognition, organic search is one of the few near-zero-marginal-cost acquisition channels available (`26_ROADMAP.md`). This means indexable, well-structured pages must exist from V1, not be retrofitted after launch.

## 19.2 Indexable Page Structure

```
/{locale}/{city}/{room-type}            e.g. /az/baku/meeting-rooms, /en/baku/coworking
/{locale}/{city}/{district}/{room-type} e.g. /az/baku/nizami/training-rooms  (V1.1 once enough density exists per district)
/{locale}/rooms/{slug}-{id}             Individual room detail pages
/{locale}/providers/{slug}-{id}         Provider profile pages
```

These pages are generated from the same search module (`16_SEARCH_ARCHITECTURE.md` §16.5) with fixed filters, not hand-authored — a new city/room-type combination becomes indexable automatically once real listings exist for it, and a combination with zero listings is **not** published as a thin/empty page (which search engines penalize) until it has real content.

## 19.3 Rendering Strategy: SSR/SSG Where It Matters

- **SEO landing pages and room/provider detail pages**: server-side rendered (SSR) or incrementally statically regenerated (ISR/on-demand SSG), so search-engine crawlers see fully-rendered content, not an empty shell waiting on client-side JavaScript.
- **Search results and the interactive booking flow**: can remain client-rendered (SPA-style) since these pages are not meaningfully indexable/useful as static search-engine content anyway (they're inherently personalized/parameterized by live availability).
- Framework choice (Next.js or equivalent) is deferred to `27_ADRS.md`, but SSR/SSG capability is a **hard requirement** on whatever frontend framework is selected — this is not negotiable given the SEO-first mandate.

## 19.4 Metadata, Multilingual SEO

- Every indexable page has locale-specific `<title>`, `<meta description>`, and Open Graph tags resolved through the same translation-key system as UI copy (`20_I18N.md`) — no hardcoded English fallback silently shown to a non-English crawler/user.
- `hreflang` tags link each page to its equivalent in all other active locales, plus `x-default`, so search engines correctly serve the right language version to the right searcher and don't treat translated pages as duplicate content.
- Canonical tags point to the definitive URL for a given page (important once query-parameter-based filter combinations exist on search results, to avoid diluting ranking signal across near-duplicate URLs).

## 19.5 Structured Data (Schema.org)

Room detail pages emit `LocalBusiness`/`Product`-style structured data (price, availability, rating, address) so search engines can render rich results (price/rating snippets) — this is a low-cost, high-leverage addition since the same data already exists on the page for human readers.

## 19.6 Sitemap & Crawl Management

An auto-generated, regularly updated XML sitemap covering all active indexable pages (segmented by locale), submitted to Google Search Console/Bing Webmaster Tools; `robots.txt` excludes account pages, the booking/payment flow, and admin/provider dashboards from crawling (these are non-indexable by design and would otherwise waste crawl budget).

## 19.7 Content Strategy Note

SEO landing pages need real, non-thin content beyond just a filtered listing grid to rank well long-term (a short localized intro paragraph about the city/category, e.g. "Meeting rooms in Baku" with genuinely useful local context) — this is a content/copywriting task for the launch team, not purely an engineering one, and is flagged here so it's planned for rather than assumed to happen automatically once the technical page exists.

## 19.8 Launch-Language SEO Prioritization

Per `20_I18N.md`, AZ/EN/RU are the content-active launch languages — SEO effort (structured data quality, landing-page copy, backlink/content work) is concentrated there first, with TR/DE/ES pages existing (technically indexable, correctly localized UI chrome) but not receiving dedicated SEO content investment until a market-entry decision (`02_MARKET_RESEARCH.md` §2.3) justifies it.
