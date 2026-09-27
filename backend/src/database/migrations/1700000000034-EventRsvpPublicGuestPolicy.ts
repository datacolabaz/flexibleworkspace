import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public / guest RSVP on published events.
 *
 * Migration 033 required event_rsvps.user_id to match app.current_user_id,
 * which blocks logged-out guests (user_id IS NULL, session vars empty).
 * Capacity counts also failed for anonymous callers because SELECT only
 * allowed the row owner.
 *
 * Guest INSERT is allowed only when user_id is null and the event is
 * published or rsvp_open. Authenticated INSERT still requires user_id to
 * match the session. Organizers and admins can SELECT RSVPs; public
 * SELECT is limited to counting rows on visible events (same status set
 * as events_select public rows).
 */
export class EventRsvpPublicGuestPolicy1700000000034 implements MigrationInterface {
  name = 'EventRsvpPublicGuestPolicy1700000000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS event_rsvps_insert ON event_rsvps`);
    await queryRunner.query(`DROP POLICY IF EXISTS event_rsvps_select ON event_rsvps`);

    await queryRunner.query(`
      CREATE POLICY event_rsvps_select ON event_rsvps
        FOR SELECT USING (
          CAST(user_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','support_admin')
          OR EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = event_rsvps.event_id
              AND CAST(e.organizer_id AS text) = current_setting('app.current_user_id', true)
          )
          OR EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = event_rsvps.event_id
              AND e.deleted_at IS NULL
              AND e.status IN ('published','rsvp_open','sold_out','completed')
          )
        )
    `);

    await queryRunner.query(`
      CREATE POLICY event_rsvps_insert ON event_rsvps
        FOR INSERT WITH CHECK (
          (
            user_id IS NULL
            AND EXISTS (
              SELECT 1 FROM events e
              WHERE e.id = event_rsvps.event_id
                AND e.deleted_at IS NULL
                AND e.status IN ('published','rsvp_open')
            )
          )
          OR CAST(user_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true) IN ('super_admin','operations_admin')
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY IF EXISTS event_rsvps_insert ON event_rsvps`);
    await queryRunner.query(`DROP POLICY IF EXISTS event_rsvps_select ON event_rsvps`);

    await queryRunner.query(`
      CREATE POLICY event_rsvps_select ON event_rsvps
        FOR SELECT USING (
          CAST(user_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','support_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY event_rsvps_insert ON event_rsvps
        FOR INSERT WITH CHECK (
          CAST(user_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true) IN ('super_admin','operations_admin')
        )
    `);
  }
}
