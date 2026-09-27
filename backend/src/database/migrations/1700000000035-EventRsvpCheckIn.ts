import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organizer check-in for public RSVPs (QR encodes confirmation_code).
 * Ticket purchase QR / event_tickets are unchanged.
 */
export class EventRsvpCheckIn1700000000035 implements MigrationInterface {
  name = 'EventRsvpCheckIn1700000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE event_rsvps
        ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS checked_in_by UUID
    `);

    await queryRunner.query(`DROP POLICY IF EXISTS event_rsvps_update ON event_rsvps`);
    await queryRunner.query(`
      CREATE POLICY event_rsvps_update ON event_rsvps
        FOR UPDATE USING (
          EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = event_rsvps.event_id
              AND CAST(e.organizer_id AS text) = current_setting('app.current_user_id', true)
          )
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','support_admin')
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = event_rsvps.event_id
              AND CAST(e.organizer_id AS text) = current_setting('app.current_user_id', true)
          )
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','support_admin')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS event_rsvps_update ON event_rsvps`);
    await queryRunner.query(`
      ALTER TABLE event_rsvps
        DROP COLUMN IF EXISTS checked_in_at,
        DROP COLUMN IF EXISTS checked_in_by
    `);
  }
}
