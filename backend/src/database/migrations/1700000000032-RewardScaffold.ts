import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — inactive reward scaffold only. No payout/reward services.
 * `reward_rule.is_active` defaults to false and must stay false in MVP.
 */
export class RewardScaffold1700000000032 implements MigrationInterface {
  name = 'RewardScaffold1700000000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reward_rule (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        recipient_type VARCHAR(20) NOT NULL
          CHECK (recipient_type IN ('organizer','promoter','provider','customer')),
        rate DECIMAL(5,4) NOT NULL,
        max_reward_minor INT NULL,
        funded_by VARCHAR(20) NOT NULL DEFAULT 'spotva_commission',
        attribution_source_type VARCHAR(30) NULL,
        is_active BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS referral_reward (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        commission_ledger_id UUID NULL,
        booking_id UUID NULL REFERENCES booking(id),
        rule_id UUID NULL REFERENCES reward_rule(id),
        recipient_type VARCHAR(20) NOT NULL,
        recipient_id UUID NOT NULL,
        reward_amount_minor INT NOT NULL DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending','eligible','approved','paid','reversed','rejected')),
        eligible_at TIMESTAMPTZ NULL,
        reversed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      ALTER TABLE reward_rule ENABLE ROW LEVEL SECURITY;
      ALTER TABLE reward_rule FORCE ROW LEVEL SECURITY;
      CREATE POLICY reward_rule_select ON reward_rule
        FOR SELECT USING (
          current_setting('app.current_role', true)
            IN ('super_admin','finance_admin','operations_admin')
        );
      CREATE POLICY reward_rule_insert ON reward_rule
        FOR INSERT WITH CHECK (
          current_setting('app.current_role', true)
            IN ('super_admin','finance_admin')
        );
    `);
    await queryRunner.query(`
      ALTER TABLE referral_reward ENABLE ROW LEVEL SECURITY;
      ALTER TABLE referral_reward FORCE ROW LEVEL SECURITY;
      CREATE POLICY referral_reward_select ON referral_reward
        FOR SELECT USING (
          recipient_id::text = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','finance_admin','operations_admin')
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS referral_reward_select ON referral_reward;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS reward_rule_select ON reward_rule;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS reward_rule_insert ON reward_rule;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS referral_reward;`);
    await queryRunner.query(`DROP TABLE IF EXISTS reward_rule;`);
  }
}
