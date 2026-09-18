# 16 — Search Architecture

## 16.1 Decision: PostgreSQL-First Search, No Elasticsearch/OpenSearch at V1

**Evaluated and rejected for V1**, with reasoning (not just asserted per the brief's requirement to justify every technology choice):

| Factor | Elasticsearch/OpenSearch | PostgreSQL-first |
|---|---|---|
| Infra cost | A dedicated cluster (even a small managed one) is a recurring cost with zero users on day one — directly violates the low-infra-cost mandate | Already paying for Postgres for everything else; search reuses the same instance |
| Operational complexity | Separate service to deploy, monitor, keep in sync with the source-of-truth database (dual-write/CDC problem), version-upgrade | Single database, single source of truth, no sync problem |
| Actual V1 catalog size | Overkill — Elasticsearch is built for millions of documents/complex relevance tuning at scale FlexSpace won't have for a long time | PostgreSQL's GIN/GIST indexes comfortably handle tens of thousands of listings with sub-second queries |
| Team complexity | Requires search-engine-specific expertise (query DSL, index mapping, cluster tuning) on a small team | Team already needs to know SQL for everything else |

**This is exactly the kind of "sirıyıb xərci şişirtmə" (needlessly bolted-on enterprise complexity) the brief explicitly warns against — Elasticsearch would be solving a scale problem FlexSpace doesn't have yet, at real recurring cost, for no V1 benefit.**

**Migration trigger (explicit, not vague):** revisit a dedicated search engine when either (a) active listings exceed roughly 5,000–10,000 and query latency measurably degrades past the 500ms target (`01_PRODUCT_REQUIREMENTS.md`), or (b) product requirements grow into full natural-language/semantic search (`26_ROADMAP.md` V3 AI search) that genuinely needs a vector/inverted-index engine PostgreSQL's `tsvector` can't reasonably serve. Until then, this is a documented option, not a current gap.

## 16.2 Query Composition

A single search request combines, in one SQL query (not several round-trips):

1. **Structured filters** (indexed, exact/range predicates): `city`, `district`, `room_type_id`, `capacity_min/max`, `price range`, `amenities` (array containment), `verification_status = VERIFIED`, `status = ACTIVE`.
2. **Geospatial filter/sort**: `ST_DWithin` for a radius filter (when searching "near me" or a specific area), `ST_Distance` for sort-by-distance and for the "X km away" display value (`15_MAPS_ARCHITECTURE.md`).
3. **Full-text/fuzzy match** (when the user free-types a location or keyword rather than picking from autocomplete): `tsvector` match on room/provider name + `pg_trgm` similarity for typo tolerance on city/district names.
4. **Live availability filter**: a subquery/join against `booking_item` and `AvailabilityRule`/`BlockedPeriod` (the same logic as `12_RESERVATION_ENGINE.md` §12.1) to exclude rooms that aren't actually free for the requested date/time/duration — **a room is never shown as a result if it can't actually be booked for the requested slot.** This is what makes the marketplace's core promise ("real availability") true rather than aspirational.
5. **Rating aggregation**: precomputed `Room.average_rating`/`review_count` (denormalized, updated on new review via trigger or application-layer update — avoids an expensive live aggregation on every search request).

## 16.3 Relevance Ranking Formula (V1)

A blended score, computed server-side, default sort:

```
score = (w1 × availability_match)     // binary: 1 if available for requested slot, else excluded entirely (not just down-ranked)
       + (w2 × price_fit)             // normalized distance from user's stated budget, closer = higher
       + (w3 × distance_score)        // inverse of distance from search origin
       + (w4 × rating_score)          // normalized average rating × log-dampened review count (prevents a single 5-star review from outranking a well-reviewed room)
       + (w5 × amenity_match_ratio)   // fraction of requested amenities present
       + (w6 × capacity_fit)          // penalizes rooms far larger than requested participant count (a 50-person hall for a 4-person meeting ranks lower even if otherwise a good match)
```

Weights (`w1..w6`) are configuration, not hardcoded constants — stored centrally so they can be tuned post-launch based on real conversion data (`21_ANALYTICS.md`) without a deployment. Exact starting weights are a Phase 2 implementation/tuning detail; the important architectural commitment here is that **the formula and its inputs are named and observable**, not an opaque black box, so the platform can explain and improve ranking over time.

Explicit alternate sorts (Price, Distance, Rating — `07_UX_ARCHITECTURE.md`) simply reorder by that single dimension, bypassing the blended formula, for users who want direct control.

## 16.4 Performance Approach

- Composite and partial indexes matched to the actual filter combinations used by the UI (`10_DATABASE_SCHEMA.md` §16.5) rather than indexing every column independently.
- A short-TTL (e.g. 30–60 second) read-through cache (in-process or a single small Redis instance already present for job queuing, `22_INFRASTRUCTURE.md`) for the *most repeated* query shapes (e.g. default "Baku, this weekend" searches during a marketing push) — an optimization layered on top of a database that is already fast, not a substitute for good indexing.
- Query plans reviewed (`EXPLAIN ANALYZE`) against realistic data volume before launch, not just against an empty/seed database — a concrete, cheap pre-launch QA step that prevents "worked in dev, slow in production" surprises.

## 16.5 SEO Landing Pages Are a Search Consumer, Not a Separate System

The indexable pages (`/az/baku/meeting-rooms`, etc. — `19_SEO.md`) are generated by running the same search query with fixed filters (city + room type) and are either server-rendered or statically regenerated on a schedule/on-demand (`19_SEO.md`) — they read from the same search module, so ranking logic and real availability data are never duplicated or allowed to drift between "what SEO pages show" and "what the interactive search shows."
