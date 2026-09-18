# 12 — Reservation Engine

This is the most operationally critical module in the platform — the entire product's trust promise depends on it never double-booking.

## 12.1 Availability Composition

A room's real-time availability for a requested time range is computed by intersecting, in this order:

1. `Location.opening_hours` (is the location even open at this time)
2. `Room.AvailabilityRule` (recurring weekly schedule + date-specific overrides, e.g. holiday closures)
3. `Room.BlockedPeriod` (manual closures — "this room is closed 14:00–17:00")
4. Existing `BookingItem` rows in a non-terminal status (`PENDING`, `PAYMENT_PENDING`, `CONFIRMED`) overlapping the requested range
5. `Room.buffer_minutes` (cleanup/turnover buffer applied before/after any existing booking — prevents back-to-back bookings with zero turnaround)
6. `Room.min_booking_minutes` / `max_booking_minutes` (requested duration must fit)
7. `Room.advance_booking_window_days` (how far in advance a booking can be made — both a minimum, e.g. "at least 1 hour notice," and a maximum, e.g. "no more than 90 days out")

A **holiday calendar** is modeled as a shared, reusable `Holiday` reference table (country/region-scoped) that a `Location` opts into, rather than every provider manually entering the same public holidays — cheap to build, saves every single provider repetitive data entry, and directly reduces support load.

This composition is exposed via `GET /spaces/{roomId}/availability` (`11_API_CONTRACTS.md`) and computed **live from the source tables on every request** — it is never a separately maintained "availability cache" that can drift out of sync with the underlying rules and bookings. (A short-TTL read cache for popular rooms is an acceptable *performance* optimization once traffic justifies it — see `22_INFRASTRUCTURE.md` — but it must invalidate on every write to any of the five inputs above, and correctness never depends on the cache being warm.)

## 12.2 Concurrency: How Two Simultaneous Requests Resolve

This is the scenario named explicitly in the brief: two users try to book the same room/time in the same second.

1. Both requests independently pass the *read-time* availability check (12.1) — this is expected and fine, it's a race, not a bug.
2. Both attempt to create a `Booking`/`BookingItem` in `PENDING` status inside a database transaction.
3. The **PostgreSQL exclusion constraint** (`10_DATABASE_SCHEMA.md` §10.4) guarantees only one `INSERT` succeeds; the second raises a constraint-violation error inside its transaction, which the application layer catches and translates into a clean `409 SLOT_UNAVAILABLE` API response (never a raw DB error surfaced to the client).
4. The losing user's frontend receives that error and immediately re-queries availability, showing the updated (now-unavailable) state and nearby alternatives (`07_UX_ARCHITECTURE.md` §7.3 empty-state pattern) — this turns a race-condition loss into a normal, well-explained UX moment rather than a confusing failure.

**This is why "frontend availability checking is not enough" from the brief is taken literally**: the frontend check exists purely to give a fast, good-feeling UX in the 99.9% non-racing case; the database constraint is the only component actually trusted to prevent double-booking, and it holds even if application code has a bug.

## 12.3 Booking Status State Machine

```
DRAFT ──────► PENDING ──────► PAYMENT_PENDING ──────► CONFIRMED ──────► COMPLETED
  │              │                   │                     │
  │              │                   ├──► EXPIRED          ├──► CANCELLED ──► REFUND_PENDING ──► REFUNDED
  │              │                   │    (hold timeout)    │
  │              └──► EXPIRED        └──► CANCELLED         └──► NO_SHOW
  │                   (hold timeout)      (payment failed/abandoned)
  └──► (discarded, never persisted as a real row if abandoned before PENDING)
```

| Status | Meaning | Entered from | Exits to |
|---|---|---|---|
| `DRAFT` | Client-side selection, not yet a real hold | — | `PENDING` or discarded |
| `PENDING` | Slot held server-side, awaiting payment initiation | `DRAFT` | `PAYMENT_PENDING`, `EXPIRED` |
| `PAYMENT_PENDING` | Payment redirect/checkout in progress | `PENDING` | `CONFIRMED` (webhook success), `EXPIRED` (timeout), `CANCELLED` (payment explicitly failed/declined) |
| `CONFIRMED` | Payment captured, booking is real | `PAYMENT_PENDING` | `COMPLETED` (auto, after `end_at` passes), `CANCELLED` (customer/provider-initiated), `NO_SHOW` (provider-marked) |
| `COMPLETED` | Booking occurred, no further state changes except review eligibility | `CONFIRMED` (auto) | terminal |
| `CANCELLED` | Booking will not occur | `PENDING`/`PAYMENT_PENDING`/`CONFIRMED` | `REFUND_PENDING` (if a captured payment needs reversing) or terminal (if nothing was charged yet) |
| `EXPIRED` | Hold timed out without payment | `PENDING`/`PAYMENT_PENDING` | terminal |
| `NO_SHOW` | Customer didn't show, provider-flagged | `CONFIRMED` | terminal (may trigger a no-show policy charge per room's cancellation policy — V2 refinement) |
| `REFUND_PENDING` | Refund initiated, awaiting provider/payment confirmation | `CANCELLED` | `REFUNDED` |
| `REFUNDED` | Refund completed | `REFUND_PENDING` | terminal |

Transitions are enforced by an explicit state machine implementation (not scattered `if` checks across the codebase) — an illegal transition (e.g. `COMPLETED → PENDING`) throws, and every transition writes an entry to `AuditLog` when triggered by a human actor.

**Payment status is a separate state machine on `PaymentTransaction`** (`13_PAYMENT_ARCHITECTURE.md`), deliberately not merged into this one — a `Booking` can be `CANCELLED` while its `PaymentTransaction` is still `REFUND_PENDING`; collapsing these into one field would make that unrepresentable.

## 12.4 Background Jobs Owned by This Module

- **Hold-expiry sweep**: transitions stale `PENDING`/`PAYMENT_PENDING` bookings to `EXPIRED` (runs on a short interval, e.g. every 1–2 minutes — a lightweight scheduled job, not a dedicated streaming system, per the "background jobs only when needed" constraint in `22_INFRASTRUCTURE.md`).
- **Auto-complete sweep**: transitions `CONFIRMED` bookings whose `end_at` has passed to `COMPLETED`, triggering the review-request notification (`17_NOTIFICATION_ARCHITECTURE.md`).
- **Reminder sweep**: triggers the "upcoming booking" notification to both customer and provider ahead of `start_at` (`17_NOTIFICATION_ARCHITECTURE.md`).

## 12.5 Multi-Timezone Correctness

All availability computation happens in UTC internally (`10_DATABASE_SCHEMA.md` §10.3); a location's `AvailabilityRule`s are authored by the provider in the location's local time via the dashboard UI and converted to UTC at write time, and displayed back to any viewer (customer or provider) converted to *their* relevant timezone (the location's timezone for booking times — a booking is "at 15:00 Baku time" regardless of who's viewing it, not converted to the viewer's own timezone, since a room booking is inherently tied to a physical place). This distinction (physical-location-time vs. viewer-time) is called out explicitly because getting it backwards is a common and confusing bug in booking systems that expand across timezones.
