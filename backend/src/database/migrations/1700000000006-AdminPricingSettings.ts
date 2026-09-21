import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminPricingSettings1700000000006 implements MigrationInterface {
  name = 'AdminPricingSettings1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admin_pricing_setting (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(80) NOT NULL UNIQUE,
        percentage NUMERIC(5,2),
        minimum_price_amount BIGINT,
        currency CHAR(3) NOT NULL DEFAULT 'AZN',
        updated_by UUID REFERENCES app_user(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_admin_pricing_percentage CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
        CONSTRAINT chk_admin_pricing_minimum CHECK (minimum_price_amount IS NULL OR minimum_price_amount >= 0)
      );

      INSERT INTO admin_pricing_setting (setting_key, percentage, minimum_price_amount, currency)
      VALUES ('platform_default', 0, 0, 'AZN')
      ON CONFLICT (setting_key) DO NOTHING;

      INSERT INTO commission_rule (scope, percentage, fixed_fee_amount, fixed_fee_currency, priority)
      SELECT 'PLATFORM_DEFAULT'::commission_rule_scope, 0, 0, 'AZN', 0
      WHERE NOT EXISTS (
        SELECT 1 FROM commission_rule WHERE scope = 'PLATFORM_DEFAULT'::commission_rule_scope
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS admin_pricing_setting');
  }
}
