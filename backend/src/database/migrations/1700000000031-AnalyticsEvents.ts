import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — persist product analytics events.
 *
 * `analytics_event` already exists from InitSchema (BIGSERIAL id,
 * session_id, user_id, event_name, properties, created_at). This migration
 * ALTERs that table rather than creating a second one.
 */
export class AnalyticsEvents1700000000031 implements MigrationInterface {
  name = 'AnalyticsEvents1700000000031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE analytics_event ALTER COLUMN session_id DROP NOT NULL;`,
    );
    await queryRunner.query(`
      ALTER TABLE analytics_event
        ADD COLUMN IF NOT EXISTS provider_id UUID REFERENCES provider(id),
        ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES app_user(id),
        ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES location(id),
        ADD COLUMN IF NOT EXISTS event_ref_id UUID REFERENCES events(id),
        ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES booking(id),
        ADD COLUMN IF NOT EXISTS source VARCHAR(100),
        ADD COLUMN IF NOT EXISTS medium VARCHAR(100),
        ADD COLUMN IF NOT EXISTS campaign VARCHAR(100),
        ADD COLUMN IF NOT EXISTS referrer VARCHAR(500),
        ADD COLUMN IF NOT EXISTS landing_path VARCHAR(500),
        ADD COLUMN IF NOT EXISTS value NUMERIC(10,2),
        ADD COLUMN IF NOT EXISTS metadata JSONB,
        ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS client_event_id VARCHAR(64);
    `);
    await queryRunner.query(`
      UPDATE analytics_event
         SET occurred_at = created_at
       WHERE occurred_at IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE analytics_event
        ALTER COLUMN occurred_at SET DEFAULT NOW();
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_event_client_event_id
        ON analytics_event(client_event_id)
        WHERE client_event_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_event_provider
        ON analytics_event(provider_id) WHERE provider_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_event_location
        ON analytics_event(location_id) WHERE location_id IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_event_occurred
        ON analytics_event(occurred_at);
    `);

    await queryRunner.query(
      `ALTER TABLE analytics_event ENABLE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(
      `ALTER TABLE analytics_event FORCE ROW LEVEL SECURITY;`,
    );
    await queryRunner.query(`
      CREATE POLICY analytics_event_insert ON analytics_event
        FOR INSERT WITH CHECK (true);
    `);
    await queryRunner.query(`
      CREATE POLICY analytics_event_select ON analytics_event
        FOR SELECT USING (
          user_id::text = current_setting('app.current_user_id', true)
          OR provider_id::text = current_setting('app.current_provider_id', true)
          OR organizer_id::text = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin','content_admin')
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP POLICY IF EXISTS analytics_event_insert ON analytics_event;`,
    );
    await queryRunner.query(
      `DROP POLICY IF EXISTS analytics_event_select ON analytics_event;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_analytics_event_client_event_id;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_analytics_event_provider;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_analytics_event_location;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_analytics_event_occurred;`,
    );
    await queryRunner.query(`
      ALTER TABLE analytics_event
        DROP COLUMN IF EXISTS provider_id,
        DROP COLUMN IF EXISTS organizer_id,
        DROP COLUMN IF EXISTS location_id,
        DROP COLUMN IF EXISTS event_ref_id,
        DROP COLUMN IF EXISTS booking_id,
        DROP COLUMN IF EXISTS source,
        DROP COLUMN IF EXISTS medium,
        DROP COLUMN IF EXISTS campaign,
        DROP COLUMN IF EXISTS referrer,
        DROP COLUMN IF EXISTS landing_path,
        DROP COLUMN IF EXISTS value,
        DROP COLUMN IF EXISTS metadata,
        DROP COLUMN IF EXISTS occurred_at,
        DROP COLUMN IF EXISTS client_event_id;
    `);
  }
}
