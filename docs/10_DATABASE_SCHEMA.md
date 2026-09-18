# 10 — Database Schema (PostgreSQL-First)

This document translates `09_DOMAIN_MODEL.md` into concrete schema decisions. Full column-by-column DDL is a Phase 2 deliverable once this architecture is approved — this document fixes the decisions that are expensive to change later (types, indexing strategy, concurrency protection), not every column.

## 10.1 Engine & Extensions

- **PostgreSQL 16+**, single primary instance at launch (see `22_INFRASTRUCTURE.md` for read-replica timing).
- **PostGIS** extension for `geography(Point, 4326)` columns on `Location` — enables `ST_DWithin`/`ST_Distance` radius and distance-sort queries without a separate geospatial service.
- **pg_trgm** extension for fuzzy text search on provider/room names and city/district names (typo-tolerant search without a dedicated search engine).
- **tsvector + GIN index** for full-text search over room name/description/amenity labels, combined with structured filters (price/capacity/type) in the same query — see `16_SEARCH_ARCHITECTURE.md`.

## 10.2 Money & Currency

**All monetary amounts are stored as integers in the currency's minor unit** (qəpik for AZN, cents for USD/EUR — AZN has 100 qəpik per manat, same 2-decimal shape as most currencies FlexSpace will support), never as `float`/`double`. A separate `currency` column (ISO 4217, e.g. `AZN`, `EUR`, `TRY`, `GEL`) travels with every amount column. This is a one-line rule that prevents an entire class of rounding-error bugs in a payments product and costs nothing to follow from day one.

## 10.3 Time & Timezone

All timestamp columns are `timestamptz` (stored in UTC), never naive `timestamp`. Each `Location` carries its own `timezone` (IANA name, e.g. `Asia/Baku`) used only for **display and business-hours interpretation** (opening hours, availability rules are authored in the location's local time and converted to UTC ranges for storage/query). This is what makes the architecture "multi-timezone ready" without adding any real complexity now — it is simply the correct default, not extra scope.

## 10.4 Booking Concurrency Protection (the most critical schema decision in this document)

Double-booking is prevented at the **database layer**, not the application layer, using two complementary mechanisms:

1. **PostgreSQL exclusion constraint** using the `btree_gist` extension:
```sql
ALTER TABLE booking_item ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  room_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status IN ('PENDING', 'PAYMENT_PENDING', 'CONFIRMED'));
```
This makes it **physically impossible** for two `booking_item` rows with overlapping time ranges on the same room to both exist in a non-cancelled state — the database itself rejects the second insert, regardless of what the application code assumed. This is the actual guarantee behind the "double booking heard never happen" requirement; everything else (frontend availability checks) is a UX convenience layered on top, not the source of truth.

2. **Transactional hold pattern** at the application layer: creating a `Booking`/`BookingItem` in `DRAFT`→`PENDING` status happens inside a single database transaction with `SELECT ... FOR UPDATE` on the relevant `AvailabilityRule`/existing-booking rows for that room+time-range, so two simultaneous requests serialize rather than both reading "available" and racing to insert — the exclusion constraint is the last line of defense, this is the first line that gives users a clean error instead of a raw constraint-violation exception.

3. **Hold expiry:** a `PENDING`/`PAYMENT_PENDING` booking automatically transitions to `EXPIRED` after a short hold window (configurable, default e.g. 10–15 minutes) via a scheduled background job (`22_INFRASTRUCTURE.md`), releasing the slot. The exclusion constraint's `WHERE` clause only counts non-terminal statuses, so an `EXPIRED`/`CANCELLED` booking's old time range is immediately available again.

## 10.5 Indexing Strategy (V1)

| Table | Index | Purpose |
|---|---|---|
| `location` | GIST on `geography` column | Radius/nearby search |
| `room` | btree on `(location_id, status)`; btree on `room_type_id` | Filter by location and category |
| `room` | GIN on `tsvector(name, description)` | Text search |
| `booking_item` | GIST exclusion (above) + btree on `(room_id, start_at)` | Concurrency + availability lookups |
| `booking` | btree on `(customer_user_id, status)`; btree on `created_at` | "My bookings" queries, admin filtering |
| `payment_transaction` | btree on `payment_id`; unique on `external_reference` | Webhook idempotency (see 10.7) |
| `ledger_entry` | btree on `(provider_id, created_at)` | Payout period aggregation |
| `review` | unique on `booking_id` | Enforce one review per completed booking |
| `audit_log` | btree on `(entity_type, entity_id)`; btree on `created_at` | Admin audit lookups |

## 10.6 Constraints & Data Integrity

- Foreign keys enforced everywhere (no "soft" application-only references) — a `Room` cannot reference a deleted `Location`, etc.
- `UNIQUE` constraints: `(provider_id, slug)` on `Room`, `(email)` and `(phone)` on `User` (nullable-unique, since either can be the login identifier), `booking_id` on `Review`.
- **Soft delete** (`deleted_at timestamptz null`) on entities with financial/historical significance that must never truly disappear: `User`, `Provider`, `Location`, `Room`, `Booking` (bookings are never hard-deleted — cancellation is a status, not a deletion). Hard delete is acceptable for purely operational/ephemeral data (e.g. expired search-session cache rows, if any).
- **Audit fields** (`created_at`, `updated_at`, and `created_by`/`updated_by` where an actor is meaningful) on every table — enforced via a shared migration convention/base table pattern, not left to per-table discretion.
- **Check constraints** for state sanity: `end_at > start_at` on `booking_item` and `blocked_period`; `total_amount = gross_amount + service_fee_amount` on `Booking` (or a trigger recomputing rather than trusting app-layer math, decided in Phase 2).

## 10.7 Idempotency for Payment Webhooks

`PaymentTransaction.external_reference` (the payment provider's own transaction/order ID) is `UNIQUE`. Webhook handlers upsert against this key, so a retried/duplicate webhook delivery (which every payment provider's webhook system can and will do) never double-processes a payment or double-fires a booking confirmation. This is a one-column decision that prevents a whole class of "customer charged twice" or "booking confirmed twice" incidents.

## 10.8 Why PostgreSQL-First, Not a Polyglot Database Layer

A single PostgreSQL instance handles relational data, geospatial queries (PostGIS), full-text/fuzzy search (tsvector/pg_trgm), and — via `SELECT ... FOR UPDATE`/exclusion constraints — booking concurrency, without needing a separate search engine, a separate geospatial database, or a separate locking service. This directly satisfies the "no Elasticsearch/Kubernetes/multiple databases at launch" constraint: one well-indexed Postgres instance is enough for the searchable-inventory sizes FlexSpace will have for a long time after launch (low thousands of active listings), and the migration path to a dedicated search engine (`16_SEARCH_ARCHITECTURE.md`) is additive, not a rewrite, if/when it's ever needed.

## 10.8a Pointer: Admin Operational Control Center Schema Changes

`33_ADMIN_OPERATIONAL_CONTROL_CENTER.md` §33.3 (ADR-011) adds `audit_log.reason` (nullable TEXT) and `audit_log.reverted_audit_log_id` (nullable, self-referencing) — no change to `audit_log`'s append-only, no-UPDATE/DELETE-grant posture (§10.6). `review.deleted_at` closes the one soft-delete gap found. `role_name` gains two renamed values and four additive ones (metadata-only, no data rewrite).

## 10.9a Pointer: Partner/Referral Schema Addition

`31_PARTNER_REFERRAL_ARCHITECTURE.md` §31.5 adds four new tables (`partner`, `referral_campaign`, `referral_click`, `booking_referral_attribution`) and makes one change to already-approved tables: `ledger_entry.provider_id` and `payout.provider_id` become nullable, each gains a nullable `partner_id`, and a `CHECK` constraint enforces exactly one of the two is set per row. `ledger_entry_type` gains one additive enum value, `PARTNER_COMMISSION`. No existing column, index, or query behavior changes for the provider path — see ADR-010 (`27_ADRS.md`) for the full rationale.

## 10.9 Backups & Migration Discipline

Point-in-time recovery via the managed Postgres provider's built-in backups (see `23_COST_MODEL.md`) at launch, with schema migrations managed through a versioned migration tool (e.g. Prisma Migrate/Knex/Flyway — final choice tied to the backend framework decision in `27_ADRS.md`), never hand-edited against production.
