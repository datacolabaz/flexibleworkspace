import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 4 — Promo/referral tracking data model.
 *
 * Creates:
 *   • promo_codes       — discount codes (percent or fixed).
 *   • referrals         — user-to-user referral tracking.
 *
 * Extends existing tables:
 *   • ledger_entry  — promo_code_id, referral_id, referral_source columns.
 *
 * Design notes:
 *   - discount_value: for 'percent' type it is basis-points (e.g. 1500 = 15%).
 *     For 'fixed' it is minor units (e.g. 500 = 5.00 AZN).
 *   - referrals.referred_user_id is UNIQUE: a user can only be referred once.
 *   - reward_amount is in minor units (qəpik).
 *   - ledger_entry.referral_source is a freeform UTM-style tag for
 *     attribution without a strict referral record (e.g. 'instagram_story').
 */
export class PromoReferral1700000000025 implements MigrationInterface {
  name = 'PromoReferral1700000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. ENUM types ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE promo_discount_type AS ENUM ('percent', 'fixed');
    `);
    await queryRunner.query(`
      CREATE TYPE referral_status AS ENUM ('pending', 'qualified', 'rewarded');
    `);

    // ── 2. promo_codes ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE promo_codes (
        id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        code           VARCHAR(50)  NOT NULL UNIQUE,
        discount_type  promo_discount_type NOT NULL,
        discount_value INT          NOT NULL CHECK (discount_value > 0),
        max_uses       INT          NULL,
        uses_count     INT          NOT NULL DEFAULT 0,
        valid_from     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        valid_until    TIMESTAMPTZ  NULL,
        is_active      BOOLEAN      NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_promo_codes_code ON promo_codes(code);`);
    await queryRunner.query(`CREATE INDEX idx_promo_codes_active ON promo_codes(is_active, valid_from, valid_until);`);

    // ── 3. referrals ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE referrals (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        referrer_user_id  UUID        NOT NULL REFERENCES app_user(id),
        referred_user_id  UUID        NOT NULL UNIQUE REFERENCES app_user(id),
        source            VARCHAR(100) NULL,
        status            referral_status NOT NULL DEFAULT 'pending',
        reward_amount     INT         NULL,
        booking_id        UUID        NULL REFERENCES booking(id),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);`);
    await queryRunner.query(`CREATE INDEX idx_referrals_referred ON referrals(referred_user_id);`);
    await queryRunner.query(`CREATE INDEX idx_referrals_status ON referrals(status);`);

    // ── 4. Extend ledger_entry ────────────────────────────────────────────
    // promo_code_id: which promo code reduced the booking amount.
    // referral_id: which referral relationship this ledger row was triggered by.
    // referral_source: freeform UTM/attribution tag (not tied to a referrals row).
    await queryRunner.query(`
      ALTER TABLE ledger_entry
        ADD COLUMN IF NOT EXISTS "promo_code_id"    UUID        NULL REFERENCES promo_codes(id),
        ADD COLUMN IF NOT EXISTS "referral_id"      UUID        NULL REFERENCES referrals(id),
        ADD COLUMN IF NOT EXISTS "referral_source"  VARCHAR(100) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove ledger_entry columns first (they reference the tables below).
    await queryRunner.query(`
      ALTER TABLE ledger_entry
        DROP COLUMN IF EXISTS "promo_code_id",
        DROP COLUMN IF EXISTS "referral_id",
        DROP COLUMN IF EXISTS "referral_source";
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS referrals;`);
    await queryRunner.query(`DROP TABLE IF EXISTS promo_codes;`);
    await queryRunner.query(`DROP TYPE IF EXISTS referral_status;`);
    await queryRunner.query(`DROP TYPE IF EXISTS promo_discount_type;`);
  }
}
