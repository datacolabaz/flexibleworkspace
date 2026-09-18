-- ============================================================================
-- 34 — Admin Operational Control Center DDL
--   Additive to 28_DATABASE_DDL.sql / 32_PARTNER_REFERRAL_DDL.sql. Approved
--   per ADR-011 (27_ADRS.md) and 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md
--   before Admin-module implementation began. Apply AFTER 28/30/32.
--
--   Contents:
--     1. role_name: two metadata-only renames + four additive values
--        (six admin roles instead of two).
--     2. audit_log: reason + reverted_audit_log_id (nullable, additive).
--     3. review: deleted_at (nullable, additive) — closes the one
--        soft-delete gap identified in §33.1 Q7.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. role_name — RENAME (metadata-only, no data rewrite) + ADD VALUE
-- ----------------------------------------------------------------------------

ALTER TYPE role_name RENAME VALUE 'PLATFORM_ADMIN' TO 'SUPER_ADMIN';
ALTER TYPE role_name RENAME VALUE 'SUPPORT_OPS' TO 'SUPPORT_ADMIN';

ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'OPERATIONS_ADMIN';
ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'FINANCE_ADMIN';
ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'CONTENT_ADMIN';
ALTER TYPE role_name ADD VALUE IF NOT EXISTS 'MODERATION_ADMIN';

-- ----------------------------------------------------------------------------
-- 2. audit_log — reason + revert linkage (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.3)
-- ----------------------------------------------------------------------------

ALTER TABLE audit_log ADD COLUMN reason TEXT;
ALTER TABLE audit_log ADD COLUMN reverted_audit_log_id UUID REFERENCES audit_log(id);
CREATE INDEX idx_audit_log_reverted ON audit_log (reverted_audit_log_id) WHERE reverted_audit_log_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. review — soft delete
-- ----------------------------------------------------------------------------

ALTER TABLE review ADD COLUMN deleted_at TIMESTAMPTZ;

-- ============================================================================
-- End of Admin Operational Control Center DDL.
-- ============================================================================
