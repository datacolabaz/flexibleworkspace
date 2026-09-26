import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds lightweight attribution columns to the `booking` table.
 * These track which Spotva event page sourced the booking request,
 * without a full UTM-table rewrite (Feature 5 MVP).
 *
 *  attribution_source      — e.g. 'spotva_event'; set by the frontend via
 *                            sessionStorage when a user discovers a venue
 *                            through an event detail page.
 *  attribution_event_id    — FK to events.id (SET NULL on event delete so
 *                            the booking record is never orphaned).
 */
export class BookingAttribution1700000000026 implements MigrationInterface {
  name = 'BookingAttribution1700000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE booking
        ADD COLUMN IF NOT EXISTS attribution_source       VARCHAR(100),
        ADD COLUMN IF NOT EXISTS attribution_event_id     UUID
          REFERENCES events(id) ON DELETE SET NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_booking_attribution_event
        ON booking(attribution_event_id)
        WHERE attribution_event_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_booking_attribution_event;`,
    );
    await queryRunner.query(`
      ALTER TABLE booking
        DROP COLUMN IF EXISTS attribution_source,
        DROP COLUMN IF EXISTS attribution_event_id;
    `);
  }
}
