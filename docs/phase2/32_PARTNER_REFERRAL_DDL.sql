-- ============================================================================
-- 32 — Partner / Affiliate / Referral DDL
--   Additive to 28_DATABASE_DDL.sql. Approved per ADR-010 (27_ADRS.md) and
--   31_PARTNER_REFERRAL_ARCHITECTURE.md before Phase 4 implementation
--   continued. Apply AFTER 28_DATABASE_DDL.sql and 30_SEED_DATA.sql.
--
--   Contents:
--     1. New enum types (partner_type, partner_status, referral_campaign_status)
--     2. New tables: partner, referral_campaign, referral_click,
--        booking_referral_attribution
--     3. The one schema change to previously-approved tables: ledger_entry
--        and payout gain a nullable partner_id + CHECK constraint; provider_id
--        becomes nullable on both. ledger_entry_type gains PARTNER_COMMISSION.
--     4. updated_at trigger wiring for the new tables that need it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. NEW ENUM TYPES
-- ----------------------------------------------------------------------------

CREATE TYPE partner_type AS ENUM ('AFFILIATE', 'AGENCY', 'CORPORATE', 'COMMUNITY', 'STRATEGIC_PARTNER');
CREATE TYPE partner_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE referral_campaign_status AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE partner_commission_type AS ENUM ('PERCENTAGE_OF_PLATFORM_FEE', 'FIXED_PER_BOOKING');

-- Additive enum value — existing PARTNER_COMMISSION-unaware rows/queries are
-- unaffected (31_PARTNER_REFERRAL_ARCHITECTURE.md §31.5).
ALTER TYPE ledger_entry_type ADD VALUE IF NOT EXISTS 'PARTNER_COMMISSION';

-- ----------------------------------------------------------------------------
-- 2. NEW TABLES
-- ----------------------------------------------------------------------------

CREATE TABLE partner (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     VARCHAR(255) NOT NULL,
  type                     partner_type NOT NULL,
  status                   partner_status NOT NULL DEFAULT 'PENDING',
  contact_email            CITEXT,
  contact_phone            VARCHAR(32),
  owner_user_id            UUID REFERENCES app_user(id),  -- reserved, nullable — no self-service portal in V1 (§31.7)
  default_commission_type  partner_commission_type NOT NULL DEFAULT 'PERCENTAGE_OF_PLATFORM_FEE',
  default_commission_value BIGINT NOT NULL,  -- minor units if FIXED_PER_BOOKING, basis points (1/100 of a percent) if PERCENTAGE_OF_PLATFORM_FEE
  bank_account_details     JSONB,            -- mirrors provider.bank_account_details shape
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);
CREATE INDEX idx_partner_status ON partner (status);
CREATE UNIQUE INDEX uq_partner_contact_email ON partner (contact_email) WHERE contact_email IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE referral_campaign (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id               UUID NOT NULL REFERENCES partner(id) ON DELETE CASCADE,
  name                     VARCHAR(255) NOT NULL,
  code                     VARCHAR(64) NOT NULL,
  status                   referral_campaign_status NOT NULL DEFAULT 'ACTIVE',
  commission_type_override partner_commission_type,   -- NULL = fall back to partner.default_commission_type
  commission_value_override BIGINT,                    -- NULL = fall back to partner.default_commission_value
  attribution_window_days  INTEGER NOT NULL DEFAULT 30,
  starts_at                TIMESTAMPTZ,
  ends_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_referral_campaign_window CHECK (attribution_window_days > 0)
);
CREATE UNIQUE INDEX uq_referral_campaign_code ON referral_campaign (code);
CREATE INDEX idx_referral_campaign_partner ON referral_campaign (partner_id);
CREATE INDEX idx_referral_campaign_status ON referral_campaign (status);

CREATE TABLE referral_click (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES referral_campaign(id) ON DELETE CASCADE,
  attribution_token   VARCHAR(128) NOT NULL,   -- opaque, server-generated; the ONLY value ever placed in the client cookie
  ip_hash             VARCHAR(128),            -- hashed, never raw IP (18_SECURITY.md spirit)
  user_agent          TEXT,
  landing_path        VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL     -- created_at + campaign.attribution_window_days, computed at insert time
);
CREATE UNIQUE INDEX uq_referral_click_token ON referral_click (attribution_token);
CREATE INDEX idx_referral_click_campaign ON referral_click (campaign_id);
CREATE INDEX idx_referral_click_expires ON referral_click (expires_at);

CREATE TABLE booking_referral_attribution (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
  referral_click_id   UUID NOT NULL REFERENCES referral_click(id),
  partner_id          UUID NOT NULL REFERENCES partner(id),
  campaign_id         UUID NOT NULL REFERENCES referral_campaign(id),
  attributed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_booking_referral_attribution_booking ON booking_referral_attribution (booking_id);
CREATE INDEX idx_booking_referral_attribution_partner ON booking_referral_attribution (partner_id);

-- ----------------------------------------------------------------------------
-- 3. THE ONE CHANGE TO PREVIOUSLY-APPROVED TABLES (ADR-010 / §31.5)
-- ----------------------------------------------------------------------------

ALTER TABLE ledger_entry ALTER COLUMN provider_id DROP NOT NULL;
ALTER TABLE ledger_entry ADD COLUMN partner_id UUID REFERENCES partner(id);
ALTER TABLE ledger_entry ADD CONSTRAINT chk_ledger_entry_payee_exclusive CHECK (
  (provider_id IS NOT NULL AND partner_id IS NULL) OR
  (provider_id IS NULL AND partner_id IS NOT NULL)
);
CREATE INDEX idx_ledger_entry_partner_created ON ledger_entry (partner_id, created_at) WHERE partner_id IS NOT NULL;

ALTER TABLE payout ALTER COLUMN provider_id DROP NOT NULL;
ALTER TABLE payout ADD COLUMN partner_id UUID REFERENCES partner(id);
ALTER TABLE payout ADD CONSTRAINT chk_payout_payee_exclusive CHECK (
  (provider_id IS NOT NULL AND partner_id IS NULL) OR
  (provider_id IS NULL AND partner_id IS NOT NULL)
);
CREATE INDEX idx_payout_partner_status ON payout (partner_id, status) WHERE partner_id IS NOT NULL;

-- Existing indexes/queries filtering `provider_id = ...` or `provider_id IS NOT NULL`
-- (14_PAYOUT_LEDGER.md §14.6) are unaffected — provider_id was already indexed
-- and remains populated on every existing and future provider-side row.

-- ----------------------------------------------------------------------------
-- 4. updated_at TRIGGER WIRING
-- ----------------------------------------------------------------------------
-- Reuses the set_updated_at() function already defined in 28_DATABASE_DDL.sql.

CREATE TRIGGER trg_partner_updated_at BEFORE UPDATE ON partner
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- End of Partner/Referral DDL. See 29_API_OPENAPI.yaml (Partner section) for
-- the corresponding API contract.
-- ============================================================================
