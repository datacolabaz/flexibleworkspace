import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 05_USER_FLOWS.md §5.6 / 14_PAYOUT_LEDGER.md §14.3-§14.4 — the platform-
 * wide fallback cancellation policy (used whenever a room never set its
 * own `cancellation_policy`) was hardcoded in RefundsService and
 * PayoutsService (`free_until_hours ?? 24`, `partial_refund_pct ?? 0`),
 * each flagged "REQUIRES USER ACTION / BUSINESS DECISION to confirm this
 * platform-wide fallback before launch." Makes it an admin-editable
 * setting instead — same "platform_default" single-row pattern as
 * `admin_pricing_setting` (1700000000006). Seeded with the SAME values the
 * code already defaulted to, so behavior doesn't change until an admin
 * edits it here.
 */
export class AdminCancellationPolicySettings1700000000010 implements MigrationInterface {
  name = 'AdminCancellationPolicySettings1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admin_cancellation_policy_setting (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(80) NOT NULL UNIQUE,
        free_until_hours NUMERIC(6,2) NOT NULL DEFAULT 24,
        partial_refund_pct NUMERIC(5,2),
        updated_by UUID REFERENCES app_user(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_cancellation_free_until_hours CHECK (free_until_hours >= 0),
        CONSTRAINT chk_cancellation_partial_refund_pct CHECK (partial_refund_pct IS NULL OR (partial_refund_pct >= 0 AND partial_refund_pct <= 100))
      );

      INSERT INTO admin_cancellation_policy_setting (setting_key, free_until_hours, partial_refund_pct)
      VALUES ('platform_default', 24, 0)
      ON CONFLICT (setting_key) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS admin_cancellation_policy_setting',
    );
  }
}
