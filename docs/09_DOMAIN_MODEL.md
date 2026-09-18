# 09 — Domain Model

## 9.1 Core Hierarchy

```
Provider (Business)
  └── Location (1..N)
        └── Room (1..N)
              ├── AvailabilityRule (recurring schedule)
              ├── BlockedPeriod (ad hoc closures)
              ├── Photo (1..N)
              ├── RoomAmenity (M:N → Amenity)
              └── Booking (1..N, via BookingItem)
```

Example (from the brief): `ABC Workspace → Baku/Nizami → {Meeting Room A, Training Room}`, `Baku/Narimanov → {Meeting Room B, Private Office}`, `Ganja → {Training Room}`. One `Provider` row, three `Location` rows, five `Room` rows.

## 9.2 Entities

Each entity below lists: fields (key ones only — full column list in `10_DATABASE_SCHEMA.md`), relationships, lifecycle, ownership.

### User
- Fields: `id, email, phone, password_hash (nullable — supports passwordless/OTP), locale, created_at, updated_at, deleted_at (soft delete)`
- Relationships: 1:N `Role assignments` (a user can hold multiple roles, e.g. Provider owner who is also a Customer), 1:N `Booking` (as customer), 1:N `ProviderStaff`
- Lifecycle: created at first booking or explicit signup → active → soft-deleted on account closure (never hard-deleted, for financial/audit traceability)
- Ownership: self (a user manages their own profile; Admin can view/suspend)

### Role
- Fields: `id, name (CUSTOMER | PROVIDER_OWNER | PROVIDER_STAFF | PLATFORM_ADMIN | SUPPORT_OPS)`
- Relationship: M:N with `User` via `UserRole` join table, scoped optionally to a `Provider` (for PROVIDER_OWNER/STAFF) — a role assignment row carries an optional `provider_id` so the same person can be staff at multiple providers without ambiguity.

### Provider
- Fields: `id, legal_name, display_name, slug, category, tax_id (nullable — pending legal review), verification_status (PENDING|VERIFIED|REJECTED|SUSPENDED), commission_percentage (nullable — falls back to platform default), plan_tier (FREE|STARTER|PRO|ENTERPRISE), created_at, updated_at`
- Relationships: 1:N `Location`, 1:N `ProviderStaff`, 1:1 owner `User`
- Lifecycle: `PENDING → VERIFIED` (admin action) or `→ REJECTED`; `VERIFIED → SUSPENDED` (admin action, e.g. policy violation) is reversible back to `VERIFIED`
- Ownership: owner `User` + any `ProviderStaff` with sufficient permission; Admin has override access

### ProviderStaff
- Fields: `id, user_id, provider_id, permission_scope (JSON or enum set: MANAGE_ROOMS, MANAGE_BOOKINGS, VIEW_REVENUE, MANAGE_STAFF), location_id (nullable — null means all locations)`
- Lifecycle: invited by owner → accepted → active → revoked

### Location
- Fields: `id, provider_id, name, address_line, city, district, country_code, lat, lng, timezone, opening_hours (JSON), created_at, updated_at, deleted_at`
- Relationships: N:1 `Provider`, 1:N `Room`
- Index note: `(lat, lng)` indexed via PostGIS/`geography` type for radius/distance queries (`10_DATABASE_SCHEMA.md`)

### Room
- Fields: `id, location_id, room_type_id, name, slug, capacity_min, capacity_max, size_sqm (nullable), min_booking_minutes, max_booking_minutes, advance_booking_window_days, buffer_minutes, base_price_amount, base_price_currency, status (DRAFT|ACTIVE|INACTIVE), created_at, updated_at, deleted_at`
- Relationships: N:1 `Location`, 1:N `Photo`, M:N `Amenity` via `RoomAmenity`, 1:N `AvailabilityRule`, 1:N `BlockedPeriod`, 1:N `BookingItem`
- Lifecycle: `DRAFT` (provider editing, not searchable) → `ACTIVE` (searchable, requires provider `VERIFIED`) → `INACTIVE` (provider-paused, not searchable, bookings history retained)

### RoomType
- Fields: `id, translation_key, parent_type_id (nullable — e.g. "Business meeting room" as a subtype of "Meeting room"), default_capacity_range, search_facet_weight`
- This is the taxonomy table backing the 14 categories in `01_PRODUCT_REQUIREMENTS.md` §1.3 — data-driven, not a hardcoded enum, so new categories don't require a schema migration.

### Amenity
- Fields: `id, translation_key, icon_key, category (e.g. EQUIPMENT, ACCESSIBILITY, COMFORT)`

### RoomAmenity
- Join table: `room_id, amenity_id`

### Photo
- Fields: `id, room_id (or location_id for location-level cover photos), storage_key, width, height, is_cover, moderation_status (PENDING|APPROVED|REJECTED), display_order, created_at`
- See `22_INFRASTRUCTURE.md` for the object-storage/CDN pipeline this references.

### AvailabilityRule
- Fields: `id, room_id, day_of_week (or specific date for exceptions), start_time, end_time, is_open, recurrence_type (WEEKLY|DATE_SPECIFIC)`
- This models "provider working hours / location opening hours / room recurring schedule" as one mechanism — see `12_RESERVATION_ENGINE.md` for how it composes with `BlockedPeriod` and existing `Booking`s.

### BlockedPeriod
- Fields: `id, room_id, start_at, end_at, reason, created_by_user_id, created_at`
- Covers manual closures, holidays (if not modeled as a shared `Holiday` calendar — see note in `12_RESERVATION_ENGINE.md`), and maintenance blocks.

### Booking
- Fields: `id, customer_user_id, status, currency, gross_amount, service_fee_amount, total_amount, purpose (nullable free text/tag), participants_count, created_at, updated_at, confirmed_at, cancelled_at, completed_at`
- Relationships: 1:N `BookingItem` (a booking references one room + time range in V1; the `BookingItem` split exists so a V2 multi-room booking, e.g. "training room + breakout room," doesn't require a schema change)
- Lifecycle: full state machine in `12_RESERVATION_ENGINE.md` §12.3 — `DRAFT → PENDING → PAYMENT_PENDING → CONFIRMED → COMPLETED`, with `CANCELLED`, `EXPIRED`, `NO_SHOW`, `REFUND_PENDING`, `REFUNDED` as branch states.
- **Booking status and Payment status are intentionally separate fields on separate entities** — see `Payment` below and `13_PAYMENT_ARCHITECTURE.md` §13.1 for why conflating them is a modeling mistake this architecture explicitly avoids.

### BookingItem
- Fields: `id, booking_id, room_id, start_at, end_at, unit_price_amount, quantity (for future multi-unit bookings, e.g. multiple desks)`

### Payment
- Fields: `id, booking_id, provider_adapter (EPOINT|PAYRIFF|...), status (see `13_PAYMENT_ARCHITECTURE.md`), external_reference, created_at, updated_at`
- 1:N `PaymentTransaction` (a `Payment` can have multiple transaction attempts, e.g. a failed attempt followed by a successful retry)

### PaymentTransaction
- Fields: `id, payment_id, type (CHARGE|REFUND), amount, currency, status (INITIATED|AUTHORIZED|CAPTURED|FAILED|CANCELLED), gateway_response_code, webhook_received_at, created_at`

### Refund
- Fields: `id, booking_id, payment_transaction_id, amount, reason, status (REQUESTED|APPROVED|PROCESSING|COMPLETED|REJECTED), requested_by_user_id, approved_by_user_id (nullable — auto-approved refunds per policy don't need a human), created_at`

### LedgerEntry
- Fields: `id, booking_id, provider_id, entry_type (GROSS|PLATFORM_FEE|PROVIDER_NET|PROCESSING_FEE|TAX|REFUND|ADJUSTMENT), amount, currency, created_at`
- Append-only, never updated/deleted — see `14_PAYOUT_LEDGER.md` for the full accounting model. This is the single source of truth for "what does the platform owe each provider," never derived from `Booking.total_amount` alone.

### Payout
- Fields: `id, provider_id, period_start, period_end, gross_ledger_total, amount, currency, status (PENDING|AVAILABLE|PROCESSING|PAID|FAILED|REVERSED), payout_method (BANK_TRANSFER|...), initiated_by_user_id, paid_at, created_at`
- 1:N `LedgerEntry` (which entries this payout settles — via a `payout_id` foreign key on `LedgerEntry`, nullable until settled)

### Review
- Fields: `id, booking_id (unique — one review per completed booking), customer_user_id, room_id, rating (1-5), text, photos (JSON array of storage keys), provider_reply_text, provider_reply_at, moderation_status, created_at`
- Constraint: `booking_id` must reference a `Booking` with `status = COMPLETED` and `customer_user_id` must match — enforced at the service layer and backed by a DB constraint/trigger (`18_SECURITY.md`).

### Favorite
- Join table: `user_id, room_id, created_at`

### Promotion / Coupon
- `Promotion`: `id, name, type (PERCENTAGE_OFF_COMMISSION|FEATURED_PLACEMENT|...), applies_to (provider_id or category), starts_at, ends_at, config (JSON)`
- `Coupon`: `id, code, discount_type, discount_value, usage_limit, expires_at, applicable_scope` — customer-facing discount codes (V2 feature, modeled now to avoid a later schema change)

### Subscription
- Fields: `id, provider_id, plan_tier, billing_cycle, status (ACTIVE|PAST_DUE|CANCELLED), current_period_end, created_at` — see `25_PROVIDER_ARCHITECTURE.md` for tier definitions.

### Invoice
- Fields: `id, subscription_id (nullable) or booking_id (nullable — either a provider subscription invoice or a customer booking receipt/invoice), invoice_number, amount, currency, tax_amount, issued_to_user_id, pdf_storage_key, created_at`

### Notification
- Fields: `id, user_id, channel (EMAIL|SMS|WHATSAPP|PUSH), template_key, locale, status (QUEUED|SENT|FAILED), payload (JSON), created_at, sent_at`

### AuditLog
- Fields: `id, actor_user_id, action, entity_type, entity_id, before_state (JSON), after_state (JSON), ip_address, created_at`
- Append-only; every financial and admin action writes here (`18_SECURITY.md`, `24_ADMIN_ARCHITECTURE.md`).

### Verification (embedded as `Provider.verification_status` + a history table)
- `ProviderVerificationEvent`: `id, provider_id, status, reviewed_by_user_id, notes, created_at` — kept as an append-only history rather than overwriting `Provider.verification_status` blindly, so "why was this provider rejected then re-verified" is always answerable.

## 9.3 Deferred Entities (named now, built in V2/V3 per `26_ROADMAP.md`)

`Company, Employee, Team, Budget, BookingPolicy, ApprovedLocation, MonthlyLimit` (corporate accounts — §9.4 below shows how these attach without breaking the V1 model).

## 9.4 Forward-Compatibility Note: Corporate Accounts

The V1 model already supports this cleanly: a `Company` (V2) would simply be another `Role`-holding entity that a `Booking.customer_user_id`'s user belongs to, with the `Booking` gaining an optional `paid_by_company_id` + `budget_id` reference and the `Payment` gaining a `payment_method_type = COMPANY_BUDGET` alongside `CARD`. No V1 entity needs to change shape to support this later — it's additive, which is the specific test this domain model was designed against.

## 9.4a Pointer: Six Admin Roles, Audit Reason/Revert

`33_ADMIN_OPERATIONAL_CONTROL_CENTER.md` extends `Role` from two internal-staff values to six (`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `CONTENT_ADMIN`, `SUPPORT_ADMIN`, `MODERATION_ADMIN` — via enum rename + additive values, ADR-011) and adds `reason` + `reverted_audit_log_id` to `AuditLog`. No other entity in this document changes shape.

## 9.5 Pointer: Partner / Affiliate / Referral Entities

Four new entities — `Partner`, `ReferralCampaign`, `ReferralClick`, `BookingReferralAttribution` — were added before Phase 4 implementation as a second demand-acquisition channel. They are documented in full in `31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.2 rather than here, to keep that addendum self-contained and its one schema conflict (§31.5) clearly scoped. In brief: a `Partner` runs `ReferralCampaign`s, each click is recorded server-side as a `ReferralClick`, and a `Booking` gets at most one `BookingReferralAttribution` — the deterministic chain is `Partner → ReferralCampaign → ReferralClick → Booking → PARTNER_COMMISSION ledger entry`. See ADR-010 (`27_ADRS.md`) for the decision record.
