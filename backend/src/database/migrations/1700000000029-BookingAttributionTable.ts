import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 — dedicated booking_attribution snapshot table.
 *
 * Migration 026 only added freeform `booking.attribution_source` /
 * `booking.attribution_event_id` columns. Those stay. This table is the
 * immutable, server-validated attribution record (one row per booking).
 * Partner rows in `booking_referral_attribution` are unchanged.
 */
export class BookingAttributionTable1700000000029 implements MigrationInterface {
  name = 'BookingAttributionTable1700000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS booking_attribution (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID NOT NULL UNIQUE REFERENCES booking(id),
        source_type VARCHAR(30) NOT NULL DEFAULT 'unknown'
          CHECK (source_type IN (
            'organic','direct','paid_campaign','provider_referral',
            'event_page','organizer_referral','external_partner','unknown'
          )),
        source_id UUID NULL,
        source_code VARCHAR(100) NULL,
        first_touch_source JSONB NULL,
        last_touch_source JSONB NULL,
        landing_path VARCHAR(500) NULL,
        event_id UUID NULL REFERENCES events(id),
        organizer_id UUID NULL REFERENCES app_user(id),
        provider_id UUID NULL REFERENCES provider(id),
        location_id UUID NULL REFERENCES location(id),
        session_id VARCHAR(255) NULL,
        attribution_model VARCHAR(30) NOT NULL DEFAULT 'last_click_7d',
        attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attribution_locked_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_attribution_booking_id
        ON booking_attribution(booking_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_attribution_event_id
        ON booking_attribution(event_id) WHERE event_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_attribution_provider_id
        ON booking_attribution(provider_id) WHERE provider_id IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_booking_attribution_mutation()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'booking_attribution is immutable after insert';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_booking_attribution_immutable ON booking_attribution;
      CREATE TRIGGER trg_booking_attribution_immutable
        BEFORE UPDATE OR DELETE ON booking_attribution
        FOR EACH ROW EXECUTE FUNCTION prevent_booking_attribution_mutation();
    `);

    await queryRunner.query(
      `ALTER TABLE booking_attribution ENABLE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(
      `ALTER TABLE booking_attribution FORCE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(`
      CREATE POLICY booking_attribution_select ON booking_attribution
        FOR SELECT USING (
          provider_id::text = current_setting('app.current_provider_id', true)
          OR organizer_id::text = current_setting('app.current_user_id', true)
          OR booking_id IN (
            SELECT b.id FROM booking b
            WHERE b.customer_user_id::text = current_setting('app.current_user_id', true)
          )
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin','support_admin')
        );
    `);
    await queryRunner.query(`
      CREATE POLICY booking_attribution_insert ON booking_attribution
        FOR INSERT WITH CHECK (
          current_setting('app.current_user_id', true) <> ''
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin')
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS booking_attribution_select ON booking_attribution;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS booking_attribution_insert ON booking_attribution;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_booking_attribution_immutable ON booking_attribution;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS prevent_booking_attribution_mutation();`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS booking_attribution;`);
  }
}
