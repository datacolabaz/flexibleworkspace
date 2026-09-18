# 07 — UX Architecture

## 7.1 Guiding Principles

Minimal clicks · obvious CTA · fast search · persistent filters · skeleton loading · clear empty/error states · accessible forms · keyboard accessibility · proper mobile touch targets · fast page load. These are treated as **acceptance criteria for every screen spec below**, not aspirational values.

## 7.2 Homepage

Not a marketing brochure — the homepage's job is to get a search started in one action.

- **Hero:** "Where do you want to work, teach, meet or create?" with the search bar embedded directly in the hero (city/area, date, start time, duration/end time, participants, purpose) and a single primary CTA: **Find a space**.
- **Below the fold (in priority order):** Near me · Popular locations · Featured spaces (paid placement, clearly labeled "Featured") · Recently viewed (returning visitors, cookie/local-storage-based for anonymous users) · Popular room types (category shortcuts as visual cards, not a text menu) · How it works (3-step visual) · For businesses / List your space (secondary CTAs, visually subordinate to search).
- Nothing on the homepage requires scrolling to find the search bar — it is above the fold at all breakpoints, including mobile.

## 7.3 Search Results

- **Desktop:** two-pane layout, list on the left (scrollable, ~55% width), map on the right (sticky, ~45% width). Marker click highlights + scrolls to the corresponding list card; list-card hover highlights the corresponding marker. This bidirectional sync is a hard requirement, not a stretch goal — it's the single most-cited "feels professional" signal in marketplace UX and is cheap to implement with client-side state (no backend cost).
- **Mobile:** List/Map toggle (segmented control, sticky under the filter bar), never both at once — screen real estate doesn't support it, and forcing a split view on mobile is a common anti-pattern this design explicitly avoids.
- **Filters:** sticky filter bar (price range, room type, capacity, amenities, rating, distance) that persists across pagination and back-navigation within the session. Applying a filter re-queries without a full page reload (client-side fetch against the search API).
- **Sort/rank control:** exposed explicitly (Relevance [default blended score] · Price: low to high · Distance · Rating) — see `16_SEARCH_ARCHITECTURE.md` for the scoring formula behind "Relevance."
- **Empty state:** never a dead end — "no exact matches" always offers the nearest relaxation (wider radius, adjacent date/time, similar room type) generated from the same query with one constraint loosened, not a generic "try again."

## 7.4 Room Detail Page

Single scrollable page (not a wizard) containing, top to bottom: photo gallery → room name/provider/verified badge → key facts strip (capacity, size, price) → availability/booking panel (sticky on desktop, docked to bottom on mobile) → description/amenities/equipment/rules → map + nearby transport → reviews → cancellation policy → provider's other listings.

The **booking panel is sticky/persistent** on both breakpoints because it contains the primary CTA — the user should never have to scroll back up to book after reading reviews.

## 7.5 Booking & Price Transparency

Every price shown anywhere in the product follows the same breakdown pattern end-to-end:

```
25 AZN / hour
× 3 hours              75 AZN
Service fee              X AZN
────────────────────────────
Total                    Y AZN
```

This exact breakdown appears at: room detail (estimate), booking panel (live, per selected slot), payment step (final, immutable once payment starts), confirmation page, and receipt/invoice. No screen in the flow is allowed to show a different total than the one the user already confirmed — this consistency requirement is enforced by computing the price breakdown once server-side at `DRAFT` booking creation and never recalculating it client-side after that point (see `12_RESERVATION_ENGINE.md`).

## 7.6 Loading, Empty, and Error States (system-wide contract)

| State | Pattern |
|---|---|
| Loading | Skeleton screens matching the final layout's shape (not a spinner) for search results, room detail, dashboard lists |
| Empty (no results) | Explains why + offers a relaxed alternative query (7.3) |
| Empty (no bookings yet / no reviews yet) | Explains what will appear here + a CTA toward the action that populates it |
| Error (network/server) | Plain-language message + retry action; never a raw error code or stack trace shown to the end user |
| Error (validation) | Inline, field-level, before submission where possible (client + server validation both localized, see `20_I18N.md`) |

## 7.7 Accessibility (WCAG-aligned, see also `18_SECURITY.md` for form security overlap)

Full keyboard navigation for search, filters, date/time pickers and the booking flow; visible focus states on every interactive element; ARIA labels on icon-only buttons (map markers, favorite heart, filter chips); color contrast meeting WCAG AA on all text/background pairs in the design system (`08_DESIGN_SYSTEM.md`); form fields with explicit associated labels (not placeholder-as-label); screen-reader-announced live regions for async state changes (e.g. "3 results updated" after a filter change, availability confirmation after a slot check).

## 7.8 Performance Budget

Skeleton-first rendering, image lazy-loading below the fold, responsive image sizes served from the CDN/object-storage pipeline (`22_INFRASTRUCTURE.md`), and no client-side map library load until the results/room-detail page actually needs it (homepage hero does not eagerly load Google Maps JS, which also reduces unnecessary API billing — see `15_MAPS_ARCHITECTURE.md`).
