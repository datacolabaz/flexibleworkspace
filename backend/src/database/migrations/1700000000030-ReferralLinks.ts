import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 — provider/organizer owned tracked links.
 * Distinct from admin-managed partner `referral_campaign` rows.
 * Codes are unique on this table; create-time also checks campaign codes
 * so GET /r/{code} never has an ambiguous owner.
 */
export class ReferralLinks1700000000030 implements MigrationInterface {
  name = 'ReferralLinks1700000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_link (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_type VARCHAR(20) NOT NULL
          CHECK (owner_type IN ('provider','organizer','admin')),
        owner_id UUID NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        destination_type VARCHAR(20) NULL
          CHECK (destination_type IS NULL OR destination_type IN ('location','event','homepage')),
        destination_id UUID NULL,
        campaign VARCHAR(100) NULL,
        attribution_window_days INT NOT NULL DEFAULT 7,
        is_active BOOLEAN NOT NULL DEFAULT true,
        click_count INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_link_code
        ON referral_link(code) WHERE is_active = true;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_link_owner
        ON referral_link(owner_type, owner_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_link_click (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        referral_link_id UUID NOT NULL REFERENCES referral_link(id),
        attribution_token VARCHAR(64) UNIQUE NOT NULL,
        landing_path VARCHAR(500) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_referral_link_click_token
        ON referral_link_click(attribution_token);
    `);

    await queryRunner.query(
      `ALTER TABLE referral_link ENABLE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(
      `ALTER TABLE referral_link FORCE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(`
      CREATE POLICY referral_link_select ON referral_link
        FOR SELECT USING (
          (is_active = true AND revoked_at IS NULL)
          OR owner_id::text = current_setting('app.current_user_id', true)
          OR (
            owner_type = 'provider'
            AND owner_id::text = current_setting('app.current_provider_id', true)
          )
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin')
        );
    `);
    await queryRunner.query(`
      CREATE POLICY referral_link_insert ON referral_link
        FOR INSERT WITH CHECK (
          owner_id::text = current_setting('app.current_user_id', true)
          OR owner_id::text = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin')
        );
    `);
    await queryRunner.query(`
      CREATE POLICY referral_link_update ON referral_link
        FOR UPDATE USING (
          owner_id::text = current_setting('app.current_user_id', true)
          OR owner_id::text = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin')
        );
    `);

    await queryRunner.query(
      `ALTER TABLE referral_link_click ENABLE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(
      `ALTER TABLE referral_link_click FORCE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(`
      CREATE POLICY referral_link_click_select ON referral_link_click
        FOR SELECT USING (true);
    `);
    await queryRunner.query(`
      CREATE POLICY referral_link_click_insert ON referral_link_click
        FOR INSERT WITH CHECK (true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS referral_link_click_select ON referral_link_click;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS referral_link_click_insert ON referral_link_click;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS referral_link_select ON referral_link;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS referral_link_insert ON referral_link;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS referral_link_update ON referral_link;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS referral_link_click;`);
    await queryRunner.query(`DROP TABLE IF EXISTS referral_link;`);
  }
}
