# 11 — API Architecture & Contracts

## 11.1 Style Choice: REST (not GraphQL, not gRPC)

**Decision: REST over HTTPS with JSON, resource-oriented.**

| Alternative | Why not chosen for V1 |
|---|---|
| GraphQL | Solves an over-fetching problem this product doesn't have yet (a handful of well-known screens, not a sprawling client ecosystem); adds a query-complexity/caching/security surface (query depth limiting, N+1 resolver problems) that's pure overhead pre-launch; team hiring/onboarding is simpler for REST in most markets including AZ |
| gRPC | Excellent for internal service-to-service calls at scale, irrelevant for a modular *monolith* with one public web client — this is solving a microservices problem FlexSpace doesn't have in V1 |
| REST | Simple, cacheable (HTTP caching semantics), universally understood, trivial to document (OpenAPI), and the natural fit for a modular monolith exposing one coherent API surface to one web client |

REST is revisited only if/when a module is actually extracted into a separate service with its own scaling needs (`26_ROADMAP.md`/`27_ADRS.md`) — at that point an internal gRPC or message-queue boundary between services is worth it; the *public* API stays REST either way.

## 11.2 Conventions

- Base path: `/api/v1/...` (versioned from day one — cheap now, painful to retrofit).
- Auth: `Authorization: Bearer <JWT>` (short-lived access token + longer-lived refresh token, rotated on use). Anonymous search/browse endpoints require no auth.
- Errors: consistent envelope `{ "error": { "code": "SLOT_UNAVAILABLE", "message": "...", "details": {...} } }` with machine-readable `code` values the frontend can map to localized messages (`20_I18N.md`) — never a raw stack trace or provider-specific error string surfaced to the client.
- Pagination: cursor-based for list endpoints expected to grow large (`/provider/bookings`, `/admin/*`), offset-based acceptable for small/bounded lists.
- Idempotency: mutating endpoints that trigger payment or booking creation accept an `Idempotency-Key` header, checked against a short-lived store to safely handle client retries.

## 11.3 Representative Endpoint Contracts

### Public / Customer

```
GET  /api/v1/spaces?city=&roomType=&date=&startTime=&durationMinutes=
     &participants=&priceMax=&amenities=&sort=relevance|price|distance|rating&page=&lat=&lng=
     → paginated list of Room summaries with computed availability + relevance score

GET  /api/v1/spaces/{roomId}
     → full Room detail (photos, amenities, provider, reviews, cancellation policy)

GET  /api/v1/spaces/{roomId}/availability?date=&durationMinutes=
     → list of open time slots for that room/date, computed live (12_RESERVATION_ENGINE.md)

POST /api/v1/bookings
     body: { roomId, startAt, endAt, participants, purpose, customer: {name, email, phone} }
     → creates Booking in DRAFT/PENDING, returns booking summary + price breakdown + hold expiry

POST /api/v1/payments
     body: { bookingId, provider: "EPOINT"|"PAYRIFF" }
     → returns hosted-checkout redirect URL (13_PAYMENT_ARCHITECTURE.md)

POST /api/v1/payments/webhook/{provider}
     → provider-specific webhook receiver, signature-verified (18_SECURITY.md), idempotent (10_DATABASE_SCHEMA.md §10.7)

POST /api/v1/refunds
     body: { bookingId, reason }
     → computes refund per cancellation policy, creates Refund, triggers provider refund call

GET  /api/v1/account/bookings?status=upcoming|past|cancelled
GET  /api/v1/account/favorites
POST /api/v1/account/favorites/{roomId}
GET  /api/v1/account/invoices/{bookingId}

POST /api/v1/reviews
     body: { bookingId, rating, text, photos[] }
     → 403 if bookingId's status != COMPLETED or doesn't belong to caller (18_SECURITY.md)
```

### Provider

```
GET  /api/v1/provider/bookings?locationId=&roomId=&status=&from=&to=
POST /api/v1/provider/rooms
PATCH /api/v1/provider/rooms/{roomId}
POST /api/v1/provider/rooms/{roomId}/photos
PUT  /api/v1/provider/rooms/{roomId}/availability-rules
POST /api/v1/provider/rooms/{roomId}/blocked-periods
GET  /api/v1/provider/revenue?from=&to=
GET  /api/v1/provider/payouts
POST /api/v1/provider/staff
GET  /api/v1/provider/analytics/overview   (views, search appearances, conversion, occupancy — 21_ANALYTICS.md)
```

### Admin

```
GET   /api/v1/admin/providers?verificationStatus=
POST  /api/v1/admin/providers/{id}/verify   body: { decision: VERIFIED|REJECTED, notes }
GET   /api/v1/admin/bookings
GET   /api/v1/admin/payments
POST  /api/v1/admin/refunds/{id}/approve
GET   /api/v1/admin/payouts
POST  /api/v1/admin/payouts/{id}/mark-paid
GET   /api/v1/admin/disputes
GET   /api/v1/admin/audit-logs?entityType=&entityId=
```

## 11.2a Pointer: Admin Operational Control Center Endpoints (Additive)

`33_ADMIN_OPERATIONAL_CONTROL_CENTER.md` §33.8 adds admin cross-provider edit endpoints for rooms/locations/users, `POST /admin/audit-logs/{id}/revert`, an extended `GET /admin/audit-logs` filter set, and `GET /admin/search`. All admin mutations now require a `reason` and are permission-checked via the code-level matrix in §33.4/§33.2, on top of the existing role check in §11.4.

## 11.3a Pointer: Partner/Referral Endpoints (Additive)

`31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.6 adds `GET /r/{code}` (public tracking redirect) and an `/admin/partners*` surface (create/list/update partners, manage campaigns, per-partner analytics), plus a `payeeType` filter on the existing `GET /admin/payouts`. No existing path's request/response shape changes.

## 11.4 Authentication & Authorization

- **Customer/Provider auth:** email or phone + password, or passwordless OTP (SMS/email code) — OTP is attractive for AZ given lower password-manager habituation and reduces support load from forgotten passwords, but both are supported as it's low-cost to build both into the same auth module.
- **Admin/Support auth:** email + password + mandatory 2FA (TOTP), separate login surface from the customer/provider app (different subdomain or path, different session scope) — never share a session token type between the admin surface and the public app.
- **Authorization model:** RBAC middleware resolves `(User, Role, optional provider_id/location_id scope)` on every request. A `ProviderStaff` request is authorized only against the `provider_id`(s)/`location_id`(s) their role assignment grants — enforced in a shared middleware layer, not duplicated per-endpoint, so a missed check in one new endpoint can't silently leak cross-tenant data.
- **Ownership checks:** every customer-scoped endpoint (`/account/*`) additionally filters by `customer_user_id = current_user.id` at the query layer, not just the route layer, so a crafted request for someone else's booking ID returns 404, not another user's data.

## 11.5 Rate Limiting & Abuse Controls

Per-IP and per-account rate limits on: search (`/spaces`), booking creation (`/bookings`), auth endpoints (login/OTP request), and review creation — tuned to allow normal usage bursts (a user rapidly adjusting search filters) while blocking scraping/credential-stuffing/fake-review patterns (`18_SECURITY.md`).

## 11.6 API Documentation

OpenAPI 3 spec generated from the backend framework's route/schema definitions (not hand-maintained separately from the code) — becomes both the frontend team's contract and, later, the basis for any public partner API (a `27_ADRS.md`/V3 consideration, not built now).
