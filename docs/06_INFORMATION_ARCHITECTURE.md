# 06 — Information Architecture

## 6.1 Site Map (Customer-Facing)

```
/{locale}/                                  Homepage (search-first)
/{locale}/{city}/{room-type}                SEO landing pages (e.g. /az/baku/meeting-rooms)
/{locale}/search                            Search results (list+map)
/{locale}/rooms/{room-slug}-{id}            Room detail
/{locale}/providers/{provider-slug}-{id}    Provider public profile (all their locations/rooms)
/{locale}/booking/{booking-id}              Booking summary/payment step (auth-light, token-scoped)
/{locale}/confirmation/{booking-id}         Confirmation page
/{locale}/account/bookings                  Customer: upcoming/past/cancelled bookings
/{locale}/account/favorites
/{locale}/account/reviews
/{locale}/account/profile
/{locale}/account/payment-history
/{locale}/how-it-works
/{locale}/for-businesses                    Provider acquisition landing page
/{locale}/list-your-space                   Provider signup entry point
/{locale}/legal/terms | /privacy | /cancellation-policy | /refund-policy | /provider-agreement
```

## 6.2 Site Map (Provider-Facing — `/provider/...`, separate auth context)

```
/provider/dashboard
/provider/locations
/provider/locations/{id}/rooms
/provider/rooms/{id}/pricing
/provider/rooms/{id}/availability
/provider/calendar
/provider/bookings
/provider/revenue
/provider/payouts
/provider/reviews
/provider/analytics
/provider/photos
/provider/amenities
/provider/staff
/provider/promotions
/provider/settings
```

## 6.3 Site Map (Admin — `/admin/...`, separate auth context, RBAC-gated per section)

```
/admin/users  /admin/providers  /admin/locations  /admin/rooms
/admin/bookings  /admin/payments  /admin/refunds  /admin/payouts
/admin/reviews  /admin/reports  /admin/disputes
/admin/promotions  /admin/subscriptions  /admin/featured-listings
/admin/verification  /admin/audit-logs  /admin/analytics
```

## 6.4 URL & SEO Structure

Locale is a first path segment (`/az/`, `/en/`, `/ru/`, `/tr/`, `/de/`, `/es/`) rather than a subdomain or query parameter — this is the pattern that plays best with `hreflang`, canonical tags and static-generation caching (see `19_SEO.md`). City and room-type are both path segments (not query params) for the indexable landing pages, because query-parameter URLs are weak for organic search ranking.

Room and provider slugs are human-readable + a numeric/opaque ID suffix (`/rooms/nizami-meeting-room-a-4821`) so URLs stay stable even if a provider renames their listing (the ID, not the slug, is the actual lookup key).

## 6.5 Navigation Model

- **Primary nav (customer):** Search (always visible, sticky on scroll) · How it works · For businesses · Language switcher · Account/Login
- **No mega-menu of categories on the homepage** — category browsing happens through the search filters and the SEO landing pages, not a heavy top-nav category tree. This keeps the homepage focused on the single CTA (`07_UX_ARCHITECTURE.md`).
- **Provider dashboard nav:** left sidebar, grouped as Overview · Locations & Rooms · Calendar · Bookings · Revenue & Payouts · Reviews · Marketing (promotions/featured) · Settings — matches the mental model of "manage my business," not the raw entity list.
- **Admin nav:** left sidebar grouped by function (Marketplace: providers/locations/rooms/bookings — Finance: payments/refunds/payouts — Trust & Safety: reviews/verification/disputes — Growth: promotions/subscriptions/featured — System: audit logs/analytics).

## 6.6 Content Model for Taxonomy (Amenities, Room Types)

Room types and amenities are **data, not code** — stored as translatable taxonomy tables (`RoomType`, `Amenity`) with a `translation key` per row, so:
- adding a new room type or amenity is a data operation, not a deployment
- all 6 languages resolve the same underlying taxonomy ID to their own label (see `20_I18N.md`)
- search filters, SEO landing-page generation, and provider room-creation forms all read from the same source of truth, preventing drift between "what a provider can select" and "what a customer can filter by."
