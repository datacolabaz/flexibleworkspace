# 21 — Analytics Architecture

## 21.1 Own Event Model, Not Just a Third-Party Pixel

The platform emits a structured, first-party event stream (stored in the same PostgreSQL instance initially — a dedicated analytics warehouse is a scale-triggered addition, not a V1 requirement) rather than relying solely on a third-party analytics tool's black-box funnel. This matters because provider-facing analytics (`21.4`) and internal conversion-funnel analysis need direct query access to raw events joined against booking/provider data — something a third-party tool's UI alone can't provide without its own costly data-export tier.

## 21.2 Core Events (V1)

```
search_started        { query params: city, roomType, date, participants, ... }
search_completed       { resultCount, latencyMs }
filter_used            { filterType, filterValue }
listing_viewed         { roomId, positionInResults, source: search|seo_landing|direct }
favorite_added         { roomId }
booking_started        { roomId, requestedSlot }
payment_started        { bookingId, provider }
payment_failed         { bookingId, provider, errorCode }
booking_confirmed      { bookingId, amount, currency }
booking_cancelled      { bookingId, cancelledBy: customer|provider }
review_created         { bookingId, rating }
provider_created       { providerId }
listing_created        { roomId }
```

Every event carries a `sessionId` (anonymous, cookie/local-storage-based pre-login) and, once known, `userId` — allowing the anonymous-browse-to-registered-booking journey (`05_USER_FLOWS.md`) to be stitched into one funnel rather than looking like two disconnected sessions.

## 21.3 Conversion Funnel (the metric that matters most for marketplace health)

```
search_started → search_completed → listing_viewed → booking_started → payment_started → booking_confirmed
```

Tracked with drop-off rate at each stage, segmented by city/room-type/device — this is the primary instrument for diagnosing *why* the marketplace isn't converting (e.g. a high `search_completed → listing_viewed` drop-off suggests a ranking/relevance problem per `16_SEARCH_ARCHITECTURE.md`; a high `payment_started → booking_confirmed` drop-off suggests a payment-flow/trust problem per `13_PAYMENT_ARCHITECTURE.md`).

## 21.4 Provider-Facing Analytics (Plan-Gated, see `25_PROVIDER_ARCHITECTURE.md`)

- **Views**: how many times their listing appeared in a result set (`listing_viewed`/impressions) — basic tier available to all providers including FREE, since visibility into "are people even seeing me" is core to marketplace trust in the platform.
- **Search appearances**: how often they appeared in search results at all (even without a click) — surfaces supply-side gaps (e.g. "you appear rarely for 'training room' searches because your capacity field is empty").
- **Booking conversion**: views → bookings ratio for their own listings.
- **Revenue & occupancy**: booked-hours vs. available-hours per room — **gated to STARTER+ tiers** (`25_PROVIDER_ARCHITECTURE.md`), since this is a genuinely premium analytics feature in every reference marketplace and is a reasonable upsell lever rather than a cost the FREE tier needs to subsidize for every provider.

## 21.5 Privacy & Consent

Analytics event collection is disclosed in the Privacy Policy and subject to applicable consent requirements (cookie/tracking consent banner where legally required — `18_SECURITY.md` legal documents list); no analytics event captures raw payment card data (which never reaches FlexSpace's servers at all, `13_PAYMENT_ARCHITECTURE.md`) or full unmasked personal contact details beyond what's operationally needed.

## 21.6 Cost & Tooling Approach

V1 does not require a dedicated analytics platform (e.g. Amplitude/Mixpanel) at meaningful monthly cost — events are written to Postgres (a new `AnalyticsEvent`-style append-only table, partitioned/pruned as volume grows) and queried directly for the funnel/provider-dashboard views described above, consistent with the "no new infrastructure until it's actually needed" principle running through this whole architecture. A dedicated product-analytics tool or a proper events warehouse (e.g. exporting to a cheap columnar store) is a natural addition once event volume or the complexity of ad hoc analysis outgrows straightforward SQL queries against the operational database — named in `26_ROADMAP.md` as a V2 infrastructure upgrade trigger, not a V1 gap.
