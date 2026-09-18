import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin Operational Control Center - embeds
 * docs/phase2/34_ADMIN_AUDIT_DDL.sql VERBATIM, exactly as the prior Phase 2
 * / Partner migrations embed their respective SQL files. Approved per
 * ADR-011 (docs/27_ADRS.md) and docs/33_ADMIN_OPERATIONAL_CONTROL_CENTER.md
 * before Admin-module implementation began.
 *
 * Renames role_name's two internal-staff values (PLATFORM_ADMIN ->
 * SUPER_ADMIN, SUPPORT_OPS -> SUPPORT_ADMIN - metadata-only, no data
 * rewrite) and adds four more admin roles; adds reason/revert-linkage
 * columns to audit_log; adds review.deleted_at. See section 33.3 for the
 * full rationale.
 *
 * Source: docs/phase2/34_ADMIN_AUDIT_DDL.sql
 */
export class AdminOperationalControlCenter1700000000004 implements MigrationInterface {
  name = 'AdminOperationalControlCenter1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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

`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
-- Reverse of 34_ADMIN_AUDIT_DDL.sql.
ALTER TABLE review DROP COLUMN IF EXISTS deleted_at;

DROP INDEX IF EXISTS idx_audit_log_reverted;
ALTER TABLE audit_log DROP COLUMN IF EXISTS reverted_audit_log_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS reason;

-- Note: Postgres cannot DROP VALUE from an enum type, and renaming a
-- value back is not automated here (same documented limitation as the
-- PartnerReferral migration down()). If ever needed by hand:
--   ALTER TYPE role_name RENAME VALUE 'SUPER_ADMIN' TO 'PLATFORM_ADMIN';
--   ALTER TYPE role_name RENAME VALUE 'SUPPORT_ADMIN' TO 'SUPPORT_OPS';
-- The four additive values (OPERATIONS_ADMIN/FINANCE_ADMIN/CONTENT_ADMIN/
-- MODERATION_ADMIN) are left in place, matching PARTNER_COMMISSION's precedent.
`);
  }
}
