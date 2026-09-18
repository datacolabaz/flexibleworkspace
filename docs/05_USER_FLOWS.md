# 05 — User Flows

## 5.1 Primary Customer Journey (target: ≤ 4 core steps to a booking)

```
Landing → Search → Results (List+Map) → Room Detail → Availability & Booking → Payment → Confirmation
```

Collapsed to the 4 "screens that matter" for the success metric in `01_PRODUCT_REQUIREMENTS.md`:
1. **Search** (can start right from the homepage hero — no separate landing step required)
2. **Results** (list/map)
3. **Room detail + booking panel** (availability, price breakdown and the booking form live on the same page — not a separate step)
4. **Payment + confirmation** (payment redirect/return counts as one logical step from the user's perspective)

## 5.2 Registration Is Not a Gate

Explicit anti-pattern to avoid (seen in weaker marketplace clones): forcing account creation before search or before viewing a room. The flow is:

```
Browse (no auth) → Search (no auth) → Room Detail (no auth) →
Start Booking (no auth) → Enter contact info + select payment →
Account created automatically at payment step (email/phone becomes the login) →
Payment → Confirmation
```

Rationale: every additional gate before value-is-shown measurably drops conversion in every reference marketplace; account creation is deferred until the moment it's actually needed (to send a receipt, show booking history, and let payment succeed). A returning user can obviously also log in earlier for a faster repeat-booking flow with saved payment method (V1.1) — this is a happy-path optimization, not a blocker for new users.

## 5.3 Detailed Flow: New Customer Books a Meeting Room

1. Homepage hero search: city + date + time + duration + participants + purpose (optional free-text tag, e.g. "quiet", "projector needed" — mapped to amenity filters, not natural language parsing at V1, see `16_SEARCH_ARCHITECTURE.md`).
2. Results page: list (left) + map (right) on desktop; toggle on mobile. Filters persist across pagination and back-navigation (session-scoped, not account-scoped, for anonymous users).
3. User clicks a result → Room Detail page: photos, price breakdown, amenities, map, reviews, availability calendar widget.
4. User selects an available slot → booking summary panel appears inline (no page navigation) showing: base price × duration, service fee, total.
5. User clicks "Book & Pay" → enters name/email/phone (pre-fillable via saved browser data) → redirected to hosted payment checkout (Epoint/Payriff — see `13_PAYMENT_ARCHITECTURE.md`).
6. On payment success, webhook confirms → booking status flips `PAYMENT_PENDING → CONFIRMED` → user is redirected to a Confirmation page with booking reference, add-to-calendar (.ics) link, and receipt.
7. Confirmation email + SMS sent (see `17_NOTIFICATION_ARCHITECTURE.md`); a lightweight account now exists so the user can view this booking under "My Bookings" if they later log in with the same email/phone.

**Failure branches (must be designed, not left implicit):**
- Slot becomes unavailable between step 4 and step 5 (race condition) → booking engine rejects at `DRAFT→PENDING` transition (see `12_RESERVATION_ENGINE.md`) → user shown a clear "just booked by someone else, here are similar available slots" empty-state, not a generic error.
- Payment fails/times out → booking status `PAYMENT_PENDING → EXPIRED`, slot released automatically after a short hold window, user shown a retry option.
- User abandons at payment step → same expiry/release logic; no manual admin cleanup required (system self-heals via the hold-expiry job in `12_RESERVATION_ENGINE.md`).

## 5.4 Provider Onboarding Flow

```
Sign up (email/phone) → Create Provider profile (business name, category, tax/registration info placeholder) →
Add first Location (address via Maps autocomplete + geocoding) →
Add first Room (type, capacity, photos, amenities, pricing, availability rules) →
Submit for verification → Platform Admin reviews → VERIFIED badge granted → Listing goes live in search
```

A provider can technically save a Location/Room in draft before verification completes, but **unverified listings do not appear in public search results** — verification gates visibility, not account creation, so providers can prepare their listing while waiting on review (reduces perceived onboarding friction while still protecting customer trust).

## 5.5 Provider Manages a Booking (Manual Block Example)

```
Provider Dashboard → Calendar (room view) → Select time range → "Block this time" →
Reason (maintenance/private event/other) → Confirm → Slot removed from public availability immediately
```

This writes a `BlockedPeriod` row that the reservation engine treats identically to an existing booking when computing availability (`12_RESERVATION_ENGINE.md`).

## 5.6 Cancellation Flow (Customer-Initiated)

```
My Bookings → Select booking → "Cancel" → System shows applicable refund amount per the room's cancellation policy →
Confirm → Booking status → CANCELLED → Refund (if applicable) initiated → REFUND_PENDING → REFUNDED
```

The refund amount shown to the user **before** they confirm is computed live from the room's `CancellationPolicy` and how far out the booking start time is — this transparency requirement is carried into `07_UX_ARCHITECTURE.md` and `13_PAYMENT_ARCHITECTURE.md` as a hard requirement, not a nice-to-have, because ambiguous refund behavior was the single most common complaint found against LiquidSpace in competitor research (`03_COMPETITOR_ANALYSIS.md`).

## 5.7 Review Flow

```
Booking status = COMPLETED (auto-transitioned after end time passes, see 12_RESERVATION_ENGINE.md) →
Customer prompted (in-app + one follow-up email) → Rating + text + optional photos →
Provider notified → Provider may post one public reply
```

Only a customer with a `COMPLETED` booking against that specific room can review it — enforced at the database/service layer, not just UI (see `18_SECURITY.md` for fake-review prevention mechanics).
