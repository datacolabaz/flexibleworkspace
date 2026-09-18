import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — embeds 28_DATABASE_DDL.sql VERBATIM (generated from the
 * approved Phase 2 file, not retyped) so the database is guaranteed
 * consistent with the approved architecture. Do not hand-edit the DDL
 * portion below; change 28_DATABASE_DDL.sql upstream and regenerate.
 *
 * Source: docs/phase2/28_DATABASE_DDL.sql
 */
export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- ============================================================================
-- FlexSpace — Phase 2 Database DDL
-- PostgreSQL 16+
-- Implements the decisions fixed in 09_DOMAIN_MODEL.md and 10_DATABASE_SCHEMA.md.
-- This is schema only — no application code. Apply via a versioned migration
-- tool (Prisma Migrate / Knex / Flyway — final choice per 27_ADRS.md ADR-009),
-- never hand-run against production directly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";      -- geography type, ST_DWithin, ST_Distance (15_MAPS_ARCHITECTURE.md)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- fuzzy text search (16_SEARCH_ARCHITECTURE.md)
CREATE EXTENSION IF NOT EXISTS "btree_gist";   -- required for the exclusion constraint below (10_DATABASE_SCHEMA.md §10.4)
CREATE EXTENSION IF NOT EXISTS "citext";       -- case-insensitive email storage/lookup

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
CREATE TYPE role_name AS ENUM ('CUSTOMER', 'PROVIDER_OWNER', 'PROVIDER_STAFF', 'PLATFORM_ADMIN', 'SUPPORT_OPS');

CREATE TYPE provider_verification_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE provider_plan_tier AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');

CREATE TYPE room_status AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

CREATE TYPE booking_status AS ENUM (
  'DRAFT', 'PENDING', 'PAYMENT_PENDING', 'CONFIRMED', 'COMPLETED',
  'CANCELLED', 'EXPIRED', 'NO_SHOW', 'REFUND_PENDING', 'REFUNDED'
);

CREATE TYPE payment_adapter AS ENUM ('EPOINT', 'PAYRIFF', 'STRIPE');
CREATE TYPE payment_status AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK');
CREATE TYPE payment_transaction_type AS ENUM ('CHARGE', 'REFUND');
CREATE TYPE payment_transaction_status AS ENUM ('INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED');

CREATE TYPE refund_status AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');

CREATE TYPE ledger_entry_type AS ENUM ('GROSS', 'PLATFORM_FEE', 'PROVIDER_NET', 'PROCESSING_FEE', 'TAX', 'REFUND', 'ADJUSTMENT');

CREATE TYPE payout_status AS ENUM ('PENDING', 'AVAILABLE', 'PROCESSING', 'PAID', 'FAILED', 'REVERSED');
CREATE TYPE payout_method AS ENUM ('BANK_TRANSFER', 'PROVIDER_SPLIT');

CREATE TYPE moderation_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TYPE recurrence_type AS ENUM ('WEEKLY', 'DATE_SPECIFIC');

CREATE TYPE promotion_type AS ENUM ('PERCENTAGE_OFF_COMMISSION', 'FEATURED_PLACEMENT', 'FIXED_DISCOUNT_COUPON');
CREATE TYPE subscription_status AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');

CREATE TYPE notification_channel AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');
CREATE TYPE notification_status AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TYPE commission_rule_scope AS ENUM ('PLATFORM_DEFAULT', 'CATEGORY', 'PROVIDER', 'PROMOTIONAL');

-- ----------------------------------------------------------------------------
-- 2. SHARED CONVENTIONS
--   - Primary keys: UUID, generated via gen_random_uuid()
--   - Monetary amounts: BIGINT, minor units (qəpik/cents) — never NUMERIC/FLOAT (10_DATABASE_SCHEMA.md §10.2)
--   - Currency: CHAR(3) ISO 4217
--   - All timestamps: TIMESTAMPTZ, UTC (10_DATABASE_SCHEMA.md §10.3)
--   - created_at/updated_at on every table; deleted_at (soft delete) where noted
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 3. AUTH / USERS / ROLES
-- ----------------------------------------------------------------------------

CREATE TABLE app_user (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT UNIQUE,
  phone           VARCHAR(20) UNIQUE,
  password_hash   TEXT,                          -- nullable: passwordless/OTP supported (11_API_CONTRACTS.md §11.4)
  locale          VARCHAR(5) NOT NULL DEFAULT 'az',
  display_name    VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT chk_user_has_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX idx_user_email ON app_user (email) WHERE deleted_at IS NULL;
CREATE INDEX idx_user_phone ON app_user (phone) WHERE deleted_at IS NULL;

CREATE TABLE provider (  -- forward reference target for user_role.provider_id; created fully in §4
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE user_role (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role          role_name NOT NULL,
  provider_id   UUID REFERENCES provider(id) ON DELETE CASCADE,  -- scoped for PROVIDER_OWNER/PROVIDER_STAFF, NULL otherwise
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, provider_id)
);
CREATE INDEX idx_user_role_user ON user_role (user_id);
CREATE INDEX idx_user_role_provider ON user_role (provider_id) WHERE provider_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. PROVIDER / LOCATION / ROOM HIERARCHY
-- ----------------------------------------------------------------------------

ALTER TABLE provider
  ADD COLUMN legal_name              VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN display_name            VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN slug                    VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN owner_user_id           UUID NOT NULL REFERENCES app_user(id),
  ADD COLUMN category                VARCHAR(100),
  ADD COLUMN tax_id                  VARCHAR(100),                    -- pending legal review, 13_PAYMENT_ARCHITECTURE.md §13.6
  ADD COLUMN verification_status     provider_verification_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN commission_percentage   NUMERIC(5,2),                    -- nullable = falls back to CommissionRule resolution
  ADD COLUMN plan_tier               provider_plan_tier NOT NULL DEFAULT 'FREE',
  ADD COLUMN bank_account_details    JSONB,                           -- for payout (14_PAYOUT_LEDGER.md); encrypted at rest at app layer
  ADD COLUMN created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN deleted_at              TIMESTAMPTZ;
ALTER TABLE provider ADD CONSTRAINT uq_provider_slug UNIQUE (slug);
CREATE INDEX idx_provider_verification ON provider (verification_status) WHERE deleted_at IS NULL;

CREATE TABLE provider_staff (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider_id       UUID NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  location_id       UUID,  -- FK added after location table exists; NULL = all locations
  permission_scope  TEXT[] NOT NULL DEFAULT '{}',  -- e.g. {MANAGE_ROOMS, MANAGE_BOOKINGS, VIEW_REVENUE, MANAGE_STAFF}
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at       TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ,
  UNIQUE (user_id, provider_id)
);

CREATE TABLE location (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     UUID NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  address_line    VARCHAR(500) NOT NULL,
  city            VARCHAR(100) NOT NULL,
  district        VARCHAR(100),
  country_code    CHAR(2) NOT NULL DEFAULT 'AZ',
  geo             GEOGRAPHY(Point, 4326) NOT NULL,   -- 15_MAPS_ARCHITECTURE.md — geocoded once, stored forever
  formatted_address TEXT,
  google_place_id VARCHAR(255),
  timezone        VARCHAR(64) NOT NULL DEFAULT 'Asia/Baku',  -- 10_DATABASE_SCHEMA.md §10.3
  opening_hours   JSONB,   -- {mon: [["09:00","21:00"]], ...}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_location_provider ON location (provider_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_location_geo ON location USING GIST (geo);
CREATE INDEX idx_location_city ON location (city) WHERE deleted_at IS NULL;

ALTER TABLE provider_staff ADD CONSTRAINT fk_provider_staff_location FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE CASCADE;

CREATE TABLE room_type (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_key       VARCHAR(100) NOT NULL UNIQUE,   -- e.g. 'room_type.meeting_room' (20_I18N.md)
  parent_type_id        UUID REFERENCES room_type(id),  -- e.g. business_meeting_room -> meeting_room
  default_capacity_min  INT,
  default_capacity_max  INT,
  search_facet_weight   NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE amenity (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_key  VARCHAR(100) NOT NULL UNIQUE,
  icon_key         VARCHAR(100),
  category         VARCHAR(50)  -- EQUIPMENT | ACCESSIBILITY | COMFORT
);

CREATE TABLE room (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id               UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  room_type_id              UUID NOT NULL REFERENCES room_type(id),
  name                      VARCHAR(255) NOT NULL,
  slug                      VARCHAR(255) NOT NULL,
  description               TEXT,
  capacity_min              INT NOT NULL DEFAULT 1,
  capacity_max              INT NOT NULL,
  size_sqm                  NUMERIC(6,2),
  min_booking_minutes       INT NOT NULL DEFAULT 30,
  max_booking_minutes       INT NOT NULL DEFAULT 480,
  advance_booking_min_hours INT NOT NULL DEFAULT 1,
  advance_booking_max_days  INT NOT NULL DEFAULT 90,
  buffer_minutes            INT NOT NULL DEFAULT 0,
  base_price_amount         BIGINT NOT NULL,          -- minor units (10_DATABASE_SCHEMA.md §10.2)
  base_price_currency       CHAR(3) NOT NULL DEFAULT 'AZN',
  cancellation_policy       JSONB,                     -- e.g. {free_until_hours: 24, partial_refund_pct: 50, ...}
  status                    room_status NOT NULL DEFAULT 'DRAFT',
  search_tsv                TSVECTOR,                  -- generated column, populated by trigger (16_SEARCH_ARCHITECTURE.md)
  average_rating            NUMERIC(3,2) NOT NULL DEFAULT 0,
  review_count              INT NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ,
  CONSTRAINT uq_room_location_slug UNIQUE (location_id, slug),
  CONSTRAINT chk_room_capacity CHECK (capacity_max >= capacity_min)
);
CREATE INDEX idx_room_location_status ON room (location_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_room_type ON room (room_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_room_search_tsv ON room USING GIN (search_tsv);
CREATE INDEX idx_room_name_trgm ON room USING GIN (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION room_search_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple', coalesce(NEW.name,'') || ' ' || coalesce(NEW.description,''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_room_search_tsv BEFORE INSERT OR UPDATE ON room
  FOR EACH ROW EXECUTE FUNCTION room_search_tsv_trigger();

CREATE TABLE room_amenity (
  room_id     UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  amenity_id  UUID NOT NULL REFERENCES amenity(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, amenity_id)
);
CREATE INDEX idx_room_amenity_amenity ON room_amenity (amenity_id);

CREATE TABLE photo (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           UUID REFERENCES room(id) ON DELETE CASCADE,
  location_id       UUID REFERENCES location(id) ON DELETE CASCADE,
  storage_key       VARCHAR(500) NOT NULL,   -- object storage key (22_INFRASTRUCTURE.md §22.7)
  width             INT,
  height            INT,
  is_cover          BOOLEAN NOT NULL DEFAULT FALSE,
  moderation_status moderation_status NOT NULL DEFAULT 'PENDING',
  display_order     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_photo_owner CHECK (room_id IS NOT NULL OR location_id IS NOT NULL)
);
CREATE INDEX idx_photo_room ON photo (room_id) WHERE room_id IS NOT NULL;

CREATE TABLE holiday (   -- shared reference calendar, 12_RESERVATION_ENGINE.md §12.1
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code  CHAR(2) NOT NULL,
  observed_date DATE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  UNIQUE (country_code, observed_date)
);

CREATE TABLE availability_rule (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  recurrence_type  recurrence_type NOT NULL DEFAULT 'WEEKLY',
  day_of_week      SMALLINT,          -- 0=Sunday..6=Saturday, used when recurrence_type = WEEKLY
  specific_date    DATE,              -- used when recurrence_type = DATE_SPECIFIC (e.g. exception/override)
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  is_open          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_availability_rule_shape CHECK (
    (recurrence_type = 'WEEKLY' AND day_of_week IS NOT NULL AND specific_date IS NULL) OR
    (recurrence_type = 'DATE_SPECIFIC' AND specific_date IS NOT NULL)
  )
);
CREATE INDEX idx_availability_rule_room ON availability_rule (room_id);

CREATE TABLE blocked_period (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  reason          VARCHAR(255),
  created_by_user_id UUID NOT NULL REFERENCES app_user(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_blocked_period_range CHECK (end_at > start_at)
);
CREATE INDEX idx_blocked_period_room_range ON blocked_period (room_id, start_at, end_at);

-- ----------------------------------------------------------------------------
-- 5. BOOKINGS (12_RESERVATION_ENGINE.md)
-- ----------------------------------------------------------------------------

CREATE TABLE booking (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id      UUID NOT NULL REFERENCES app_user(id),
  status                booking_status NOT NULL DEFAULT 'DRAFT',
  currency              CHAR(3) NOT NULL DEFAULT 'AZN',
  gross_amount          BIGINT NOT NULL,
  service_fee_amount    BIGINT NOT NULL DEFAULT 0,
  total_amount          BIGINT NOT NULL,
  purpose               VARCHAR(255),
  participants_count    INT,
  hold_expires_at       TIMESTAMPTZ,      -- drives the hold-expiry sweep (12_RESERVATION_ENGINE.md §12.4)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,      -- bookings are never hard-deleted (10_DATABASE_SCHEMA.md §10.6); reserved for legal/GDPR-style anonymization only
  CONSTRAINT chk_booking_total CHECK (total_amount = gross_amount + service_fee_amount)
);
CREATE INDEX idx_booking_customer_status ON booking (customer_user_id, status);
CREATE INDEX idx_booking_created_at ON booking (created_at);
CREATE INDEX idx_booking_hold_expiry ON booking (hold_expires_at) WHERE status IN ('PENDING','PAYMENT_PENDING');

CREATE TABLE booking_item (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES room(id),
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  unit_price_amount BIGINT NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  status          booking_status NOT NULL DEFAULT 'DRAFT',   -- mirrors parent booking status; see 10_DATABASE_SCHEMA.md §10.4 exclusion constraint
  CONSTRAINT chk_booking_item_range CHECK (end_at > start_at)
);
CREATE INDEX idx_booking_item_booking ON booking_item (booking_id);
CREATE INDEX idx_booking_item_room_start ON booking_item (room_id, start_at);

-- THE critical constraint: prevents double-booking at the database level (10_DATABASE_SCHEMA.md §10.4)
ALTER TABLE booking_item ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('PENDING', 'PAYMENT_PENDING', 'CONFIRMED'));

-- ----------------------------------------------------------------------------
-- 6. PAYMENTS / REFUNDS (13_PAYMENT_ARCHITECTURE.md)
-- ----------------------------------------------------------------------------

CREATE TABLE payment (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES booking(id),
  provider_adapter  payment_adapter NOT NULL,
  status            payment_status NOT NULL DEFAULT 'INITIATED',
  external_reference VARCHAR(255),   -- gateway's own order/transaction id
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_booking ON payment (booking_id);

CREATE TABLE payment_transaction (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id            UUID NOT NULL REFERENCES payment(id) ON DELETE CASCADE,
  type                  payment_transaction_type NOT NULL,
  amount                BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'AZN',
  status                payment_transaction_status NOT NULL DEFAULT 'INITIATED',
  gateway_response_code VARCHAR(50),
  external_reference    VARCHAR(255) NOT NULL,   -- webhook idempotency key (10_DATABASE_SCHEMA.md §10.7)
  webhook_received_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payment_transaction_external_ref UNIQUE (external_reference)
);
CREATE INDEX idx_payment_transaction_payment ON payment_transaction (payment_id);

CREATE TABLE refund (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id              UUID NOT NULL REFERENCES booking(id),
  payment_transaction_id  UUID REFERENCES payment_transaction(id),
  amount                  BIGINT NOT NULL,
  currency                CHAR(3) NOT NULL DEFAULT 'AZN',
  reason                  VARCHAR(500),
  status                  refund_status NOT NULL DEFAULT 'REQUESTED',
  requested_by_user_id    UUID NOT NULL REFERENCES app_user(id),
  approved_by_user_id     UUID REFERENCES app_user(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refund_booking ON refund (booking_id);

-- ----------------------------------------------------------------------------
-- 7. LEDGER / PAYOUTS (14_PAYOUT_LEDGER.md)
-- ----------------------------------------------------------------------------

CREATE TABLE commission_rule (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         commission_rule_scope NOT NULL,
  provider_id   UUID REFERENCES provider(id) ON DELETE CASCADE,      -- set when scope = PROVIDER or PROMOTIONAL
  room_type_id  UUID REFERENCES room_type(id),                       -- set when scope = CATEGORY
  percentage    NUMERIC(5,2),
  fixed_fee_amount BIGINT,
  fixed_fee_currency CHAR(3),
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  priority      INT NOT NULL DEFAULT 0,   -- resolution order: provider-specific > category > platform default (13_PAYMENT_ARCHITECTURE.md §13.5)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commission_rule_provider ON commission_rule (provider_id) WHERE provider_id IS NOT NULL;

CREATE TABLE ledger_entry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      UUID NOT NULL REFERENCES booking(id),
  provider_id     UUID NOT NULL REFERENCES provider(id),
  entry_type      ledger_entry_type NOT NULL,
  amount          BIGINT NOT NULL,     -- signed: positive = credit, negative = debit (14_PAYOUT_LEDGER.md §14.2)
  currency        CHAR(3) NOT NULL DEFAULT 'AZN',
  payout_id       UUID,   -- FK added after payout table exists; NULL until settled
  commission_rule_id UUID REFERENCES commission_rule(id),  -- snapshot reference for audit (13_PAYMENT_ARCHITECTURE.md §13.5)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- append-only: no updated_at, no deleted_at, no UPDATE/DELETE grants at the application role level
);
CREATE INDEX idx_ledger_entry_provider_created ON ledger_entry (provider_id, created_at);
CREATE INDEX idx_ledger_entry_booking ON ledger_entry (booking_id);
CREATE INDEX idx_ledger_entry_payout ON ledger_entry (payout_id) WHERE payout_id IS NOT NULL;

CREATE TABLE payout (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id           UUID NOT NULL REFERENCES provider(id),
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  gross_ledger_total    BIGINT NOT NULL,
  amount                BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL DEFAULT 'AZN',
  status                payout_status NOT NULL DEFAULT 'PENDING',
  payout_method         payout_method NOT NULL DEFAULT 'BANK_TRANSFER',
  bank_reference        VARCHAR(255),
  initiated_by_user_id  UUID REFERENCES app_user(id),
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_provider_status ON payout (provider_id, status);

ALTER TABLE ledger_entry ADD CONSTRAINT fk_ledger_entry_payout FOREIGN KEY (payout_id) REFERENCES payout(id);

-- ----------------------------------------------------------------------------
-- 8. REVIEWS / FAVORITES (18_SECURITY.md §18.6 fake-review prevention)
-- ----------------------------------------------------------------------------

CREATE TABLE review (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL UNIQUE REFERENCES booking(id),   -- one review per booking (09_DOMAIN_MODEL.md)
  customer_user_id    UUID NOT NULL REFERENCES app_user(id),
  room_id             UUID NOT NULL REFERENCES room(id),
  rating              SMALLINT NOT NULL,
  text                TEXT,
  photos              JSONB,   -- array of storage keys
  provider_reply_text TEXT,
  provider_reply_at   TIMESTAMPTZ,
  moderation_status   moderation_status NOT NULL DEFAULT 'APPROVED',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
);
CREATE INDEX idx_review_room ON review (room_id) WHERE moderation_status = 'APPROVED';

CREATE TABLE favorite (
  user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  room_id     UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

-- ----------------------------------------------------------------------------
-- 9. PROMOTIONS / COUPONS / SUBSCRIPTIONS / INVOICES (25_PROVIDER_ARCHITECTURE.md)
-- ----------------------------------------------------------------------------

CREATE TABLE promotion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  type          promotion_type NOT NULL,
  provider_id   UUID REFERENCES provider(id),
  room_type_id  UUID REFERENCES room_type(id),
  config        JSONB,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE coupon (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) NOT NULL UNIQUE,
  discount_type   VARCHAR(20) NOT NULL,   -- PERCENTAGE | FIXED_AMOUNT
  discount_value  NUMERIC(10,2) NOT NULL,
  usage_limit     INT,
  times_used      INT NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  applicable_scope JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscription (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID NOT NULL REFERENCES provider(id),
  plan_tier           provider_plan_tier NOT NULL,
  billing_cycle       VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  status              subscription_status NOT NULL DEFAULT 'ACTIVE',
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscription_provider ON subscription (provider_id);

CREATE TABLE invoice (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID REFERENCES subscription(id),
  booking_id        UUID REFERENCES booking(id),
  invoice_number    VARCHAR(50) NOT NULL UNIQUE,
  amount            BIGINT NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'AZN',
  tax_amount        BIGINT NOT NULL DEFAULT 0,
  issued_to_user_id UUID NOT NULL REFERENCES app_user(id),
  pdf_storage_key   VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoice_target CHECK (subscription_id IS NOT NULL OR booking_id IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- 10. NOTIFICATIONS (17_NOTIFICATION_ARCHITECTURE.md)
-- ----------------------------------------------------------------------------

CREATE TABLE notification (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES app_user(id),
  channel       notification_channel NOT NULL,
  template_key  VARCHAR(100) NOT NULL,
  locale        VARCHAR(5) NOT NULL,
  status        notification_status NOT NULL DEFAULT 'QUEUED',
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);
CREATE INDEX idx_notification_user ON notification (user_id, created_at);

-- ----------------------------------------------------------------------------
-- 11. VERIFICATION HISTORY / AUDIT LOG (18_SECURITY.md §18.5, 24_ADMIN_ARCHITECTURE.md §24.2)
-- ----------------------------------------------------------------------------

CREATE TABLE provider_verification_event (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id         UUID NOT NULL REFERENCES provider(id),
  status              provider_verification_status NOT NULL,
  reviewed_by_user_id UUID REFERENCES app_user(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_event_provider ON provider_verification_event (provider_id, created_at);

CREATE TABLE audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID REFERENCES app_user(id),
  action         VARCHAR(100) NOT NULL,
  entity_type    VARCHAR(100) NOT NULL,
  entity_id      UUID,
  before_state   JSONB,
  after_state    JSONB,
  ip_address     INET,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- append-only; no UPDATE/DELETE grants at the application role level, ever (18_SECURITY.md §18.5)
);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_created ON audit_log (created_at);

-- ----------------------------------------------------------------------------
-- 12. ANALYTICS EVENTS (21_ANALYTICS.md)
-- ----------------------------------------------------------------------------

-- NOT partitioned for V1 — a plain table is simplest and sufficient at V1 volume
-- (consistent with 22_INFRASTRUCTURE.md's "no premature optimization" principle).
-- Range-partition by created_at as a scale-triggered upgrade once event volume
-- justifies it (at that point the primary key must become composite (id, created_at)
-- to satisfy PostgreSQL's partitioning requirement that the partition key be part
-- of every unique constraint — noted here so the future migration isn't a surprise).
CREATE TABLE analytics_event (
  id           BIGSERIAL PRIMARY KEY,     -- high-volume append-only table; serial is fine, no need for UUID here
  session_id   VARCHAR(100) NOT NULL,
  user_id      UUID REFERENCES app_user(id),
  event_name   VARCHAR(100) NOT NULL,
  properties   JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_event_name_created ON analytics_event (event_name, created_at);
CREATE INDEX idx_analytics_event_session ON analytics_event (session_id);

-- ----------------------------------------------------------------------------
-- 13. UPDATED_AT TRIGGER (shared convention, 10_DATABASE_SCHEMA.md §10.6)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_user','provider','location','room','booking','payment','refund','payment_transaction']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- End of Phase 2 DDL. See 29_API_OPENAPI.yaml for the corresponding API
-- contract and 30_SEED_DATA.sql for reference/taxonomy data required before
-- this schema is usable end-to-end.
-- ============================================================================

    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Full teardown in reverse dependency order. Development/rollback use only —
    // this is a destructive operation and must never run against a database
    // holding real bookings/payments (10_DATABASE_SCHEMA.md §10.6 — bookings
    // are never meant to be hard-deleted; dropping the table in a down-migration
    // is a schema-rollback operation, not a data-retention decision).
    await queryRunner.query(`
      DROP TABLE IF EXISTS analytics_event CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS provider_verification_event CASCADE;
      DROP TABLE IF EXISTS notification CASCADE;
      DROP TABLE IF EXISTS invoice CASCADE;
      DROP TABLE IF EXISTS subscription CASCADE;
      DROP TABLE IF EXISTS coupon CASCADE;
      DROP TABLE IF EXISTS promotion CASCADE;
      DROP TABLE IF EXISTS favorite CASCADE;
      DROP TABLE IF EXISTS review CASCADE;
      DROP TABLE IF EXISTS payout CASCADE;
      DROP TABLE IF EXISTS ledger_entry CASCADE;
      DROP TABLE IF EXISTS commission_rule CASCADE;
      DROP TABLE IF EXISTS refund CASCADE;
      DROP TABLE IF EXISTS payment_transaction CASCADE;
      DROP TABLE IF EXISTS payment CASCADE;
      DROP TABLE IF EXISTS booking_item CASCADE;
      DROP TABLE IF EXISTS booking CASCADE;
      DROP TABLE IF EXISTS blocked_period CASCADE;
      DROP TABLE IF EXISTS availability_rule CASCADE;
      DROP TABLE IF EXISTS holiday CASCADE;
      DROP TABLE IF EXISTS photo CASCADE;
      DROP TABLE IF EXISTS room_amenity CASCADE;
      DROP TABLE IF EXISTS room CASCADE;
      DROP TABLE IF EXISTS amenity CASCADE;
      DROP TABLE IF EXISTS room_type CASCADE;
      DROP TABLE IF EXISTS provider_staff CASCADE;
      DROP TABLE IF EXISTS location CASCADE;
      DROP TABLE IF EXISTS provider CASCADE;
      DROP TABLE IF EXISTS user_role CASCADE;
      DROP TABLE IF EXISTS app_user CASCADE;
      DROP FUNCTION IF EXISTS set_updated_at CASCADE;
      DROP FUNCTION IF EXISTS room_search_tsv_trigger CASCADE;
    `);
  }
}
