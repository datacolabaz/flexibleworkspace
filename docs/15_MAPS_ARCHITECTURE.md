# 15 — Google Maps Architecture

## 15.1 Where Maps Is Actually Used

| Use case | API | Frequency driver |
|---|---|---|
| Address entry (provider adds a Location) | Places Autocomplete + Geocoding | Once per location created/edited — low volume |
| Search results map (list+map sync) | Maps JavaScript API (dynamic map render) | Once per search-results page view — **highest-volume use case** |
| Room detail page map | Maps JavaScript API (static-feeling single marker) | Once per room-detail view |
| "Near me" search | Geolocation (browser API, free) + reverse geocoding | Occasional |
| Distance/"X km away" on listing cards | Computed server-side via PostGIS `ST_Distance` (**not** a Google Distance Matrix call) | Every search results page |
| "Get directions" link | Plain deep-link to Google Maps app/web (`https://www.google.com/maps/dir/?api=1&destination=...`) — **not a billed API call** | Every room detail view |

**Key cost decision: distance calculation for search ranking/display uses PostGIS geospatial math (free, already running for the radius query in `16_SEARCH_ARCHITECTURE.md`), not the Google Distance Matrix API.** Distance Matrix is reserved only for a future feature that needs real drive-time/transit-time (not straight-line distance) — not needed for V1's "X km away" display, which straight-line distance serves perfectly well. This alone removes one entire billed API category from the cost model.

## 15.2 API Usage Optimization (cost containment)

Google Maps Platform's pricing (as of Sept 2026) is **per-SKU with a monthly free-call allowance per SKU** (the old blanket $200/mo credit was removed in a 2025 pricing change) — Maps JS dynamic-map loads, Places Autocomplete sessions, and Geocoding requests are billed and free-allotted separately. **Verify current pricing before committing budget** — this has changed structurally in the recent past. See `23_COST_MODEL.md` for the actual dollar projections built from this.

Concrete measures to keep call volume down:
- **Lazy-load the map**: the map component is not mounted until the results/room-detail page actually renders it — the homepage hero never loads the Maps JS SDK at all (`07_UX_ARCHITECTURE.md` §7.8), which is a real, free cost reduction since a large share of visits never reach a map-bearing page.
- **Geocode once, store forever**: a `Location`'s `lat`/`lng` (`09_DOMAIN_MODEL.md`) is geocoded a single time when the provider enters/edits the address, then persisted — the platform never re-geocodes the same address on every search or page view. This is the single biggest lever, since geocoding calls would otherwise scale with *traffic*, not with *the number of locations* (which grows far more slowly).
- **Autocomplete session tokens**: Places Autocomplete is billed per completed session, not per keystroke, when session tokens are used correctly — the provider-side "add location" form implements this properly (a naive integration that omits session tokens can be billed per-keystroke, a common and expensive mistake).
- **Client-side caching of map tiles/markers** within a single results-page session (re-rendering the same map on a filter change re-uses the already-loaded map instance and just updates markers, rather than re-initializing the whole map component).
- **Static map fallback considered, not adopted for V1**: a Static Maps API image (single billed image request, no interactive JS SDK) is cheaper per-view than a full interactive map, and is a viable cost-reduction lever for the room-detail page (which doesn't need pan/zoom, just "here's where it is") if Maps costs become a meaningful budget line as traffic grows — flagged in `23_COST_MODEL.md` as a lever to pull, not pre-built now since it adds a second map-rendering code path for marginal early-stage savings.

## 15.3 Fallback / Cost Ceiling Strategy

If Maps Platform costs become disproportionate at higher traffic (a real risk — see `23_COST_MODEL.md`'s medium/high-traffic projections, where Maps can become one of the largest line items), the architecture keeps a documented, non-urgent exit ramp: replace the interactive JS map layer with **MapLibre GL JS + OpenStreetMap-based tiles** (e.g. via a low-cost tile provider or self-hosted tile server), keeping Google only for Places Autocomplete/Geocoding (which have no good free open alternative with comparable AZ address-data quality) or dropping Google entirely with a self-hosted geocoder (e.g. Nominatim) if warranted. This is named here as a fallback, not built in V1 — Google Maps' address-data quality and user familiarity are worth the (currently modest, at low traffic) cost at launch.

## 15.4 Nearby / "Near Me" Search

Implemented via the browser Geolocation API (free, user-permission-gated) feeding directly into the PostGIS radius query (`16_SEARCH_ARCHITECTURE.md`) — no Google API call is needed for this at all; reverse geocoding (turning the user's coordinates into a readable "near Nizami, Baku" label) is the only Google call involved, and it's a single cheap call per search-page load, easily covered by the free allowance at V1 traffic.

## 15.5 Data Model Touchpoints

`Location.lat`, `Location.lng` (PostGIS `geography` type, `10_DATABASE_SCHEMA.md`), `Location.formatted_address` (Google's canonical formatted string, stored so the UI never needs to re-fetch it), and a nullable `Location.google_place_id` (kept for potential future re-verification or richer place data, e.g. photos/hours sync — not used for anything load-bearing in V1).
