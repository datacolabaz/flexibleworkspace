import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 — RLS per-row ownership enforcement.
 *
 * Replaces the blanket USING(true) policies from migration 023 with proper
 * per-row ownership policies that use `current_setting('app.current_user_id',
 * true)` and related session variables set by RlsTransactionSubscriber at
 * the start of each TypeORM transaction.
 *
 * All existing `app_user_all_{table}` policies are dropped first; new
 * fine-grained policies are applied to each table.
 *
 * Policy naming convention:
 *   {table}_{operation} — e.g. booking_select, ledger_entry_insert.
 *
 * Tables covered (same set as migration 023):
 *   booking, ledger_entry, payout, provider, app_user, room, location,
 *   events, event_rsvps.
 *
 * Column notes (must match live schema / entities):
 *   - booking: customer FK is `customer_user_id`. There is NO `location_id`
 *     on booking — provider visibility goes booking_item → room → location.
 *   - events: user column is `organizer_id`; event_status labels are lowercase.
 *   - payout / ledger_entry: provider keyed via `provider_id`.
 *   - location: no `verification_status`; public read uses provider status.
 *   - provider.verification_status / room.status enums are UPPERCASE.
 *
 * Idempotent: DROP POLICY IF EXISTS before every CREATE. Safe if 033
 * partially applied (drops succeeded, first CREATE failed) and was never
 * recorded in the migrations table.
 */
export class RlsOwnershipEnforcement1700000000033 implements MigrationInterface {
  name = 'RlsOwnershipEnforcement1700000000033';

  private readonly TABLES = [
    'booking',
    'ledger_entry',
    'payout',
    'provider',
    'app_user',
    'room',
    'location',
    'events',
    'event_rsvps',
  ];

  private readonly POLICIES: { table: string; name: string }[] = [
    { table: 'booking', name: 'booking_select' },
    { table: 'booking', name: 'booking_insert' },
    { table: 'booking', name: 'booking_update' },
    { table: 'ledger_entry', name: 'ledger_entry_select' },
    { table: 'ledger_entry', name: 'ledger_entry_insert' },
    { table: 'payout', name: 'payout_select' },
    { table: 'payout', name: 'payout_insert' },
    { table: 'payout', name: 'payout_update' },
    { table: 'provider', name: 'provider_select' },
    { table: 'provider', name: 'provider_insert' },
    { table: 'provider', name: 'provider_update' },
    { table: 'app_user', name: 'app_user_select' },
    { table: 'app_user', name: 'app_user_insert' },
    { table: 'app_user', name: 'app_user_update' },
    { table: 'room', name: 'room_select' },
    { table: 'room', name: 'room_insert' },
    { table: 'room', name: 'room_update' },
    { table: 'location', name: 'location_select' },
    { table: 'location', name: 'location_insert' },
    { table: 'location', name: 'location_update' },
    { table: 'events', name: 'events_select' },
    { table: 'events', name: 'events_insert' },
    { table: 'events', name: 'events_update' },
    { table: 'event_rsvps', name: 'event_rsvps_select' },
    { table: 'event_rsvps', name: 'event_rsvps_insert' },
  ];

  /** Provider can see a booking when any item's room belongs to their location. */
  private readonly BOOKING_PROVIDER_SCOPE = `
    EXISTS (
      SELECT 1
      FROM booking_item bi
      JOIN room r ON r.id = bi.room_id
      JOIN location l ON l.id = r.location_id
      WHERE bi.booking_id = booking.id
        AND CAST(l.provider_id AS text) = current_setting('app.current_provider_id', true)
    )
  `;

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.TABLES) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "app_user_all_${table}" ON "${table}"`,
      );
    }

    for (const { table, name } of this.POLICIES) {
      await queryRunner.query(
        `DROP POLICY IF EXISTS "${name}" ON "${table}"`,
      );
    }

    // ── booking ───────────────────────────────────────────────────────────
    // Customer sees own; provider sees bookings for their rooms; admins see all.
    await queryRunner.query(`
      CREATE POLICY booking_select ON booking
        FOR SELECT USING (
          CAST(customer_user_id AS text) = current_setting('app.current_user_id', true)
          OR ${this.BOOKING_PROVIDER_SCOPE}
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin','support_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY booking_insert ON booking
        FOR INSERT WITH CHECK (
          CAST(customer_user_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY booking_update ON booking
        FOR UPDATE USING (
          CAST(customer_user_id AS text) = current_setting('app.current_user_id', true)
          OR ${this.BOOKING_PROVIDER_SCOPE}
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin','support_admin')
        )
    `);

    // ── ledger_entry — append-only; no UPDATE / DELETE ────────────────────
    await queryRunner.query(`
      CREATE POLICY ledger_entry_select ON ledger_entry
        FOR SELECT USING (
          CAST(provider_id AS text) = current_setting('app.current_provider_id', true)
          OR CAST(partner_id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true) IN ('super_admin','finance_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY ledger_entry_insert ON ledger_entry
        FOR INSERT WITH CHECK (
          current_setting('app.current_role', true)
            IN ('super_admin','finance_admin','operations_admin')
          OR current_setting('app.current_provider_id', true) <> ''
        )
    `);

    // ── payout ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE POLICY payout_select ON payout
        FOR SELECT USING (
          CAST(provider_id AS text) = current_setting('app.current_provider_id', true)
          OR CAST(partner_id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true) IN ('super_admin','finance_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY payout_insert ON payout
        FOR INSERT WITH CHECK (
          current_setting('app.current_role', true) IN ('super_admin','finance_admin','operations_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY payout_update ON payout
        FOR UPDATE USING (
          current_setting('app.current_role', true) IN ('super_admin','finance_admin','operations_admin')
        )
    `);

    // ── provider ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE POLICY provider_select ON provider
        FOR SELECT USING (
          verification_status = 'VERIFIED'
          OR CAST(id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','finance_admin','support_admin','moderation_admin','content_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY provider_insert ON provider
        FOR INSERT WITH CHECK (
          current_setting('app.current_role', true) IN ('super_admin','operations_admin')
          OR CAST(id AS text) = current_setting('app.current_provider_id', true)
        )
    `);
    await queryRunner.query(`
      CREATE POLICY provider_update ON provider
        FOR UPDATE USING (
          CAST(id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','moderation_admin')
        )
    `);

    // ── app_user ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE POLICY app_user_select ON app_user
        FOR SELECT USING (
          CAST(id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','support_admin','finance_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY app_user_insert ON app_user
        FOR INSERT WITH CHECK (true)
    `);
    await queryRunner.query(`
      CREATE POLICY app_user_update ON app_user
        FOR UPDATE USING (
          CAST(id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','support_admin')
        )
    `);

    // ── room ──────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE POLICY room_select ON room
        FOR SELECT USING (
          status = 'ACTIVE'
          OR location_id IN (
            SELECT l.id FROM location l
            WHERE CAST(l.provider_id AS text) = current_setting('app.current_provider_id', true)
          )
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','content_admin','moderation_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY room_insert ON room
        FOR INSERT WITH CHECK (
          location_id IN (
            SELECT l.id FROM location l
            WHERE CAST(l.provider_id AS text) = current_setting('app.current_provider_id', true)
          )
          OR current_setting('app.current_role', true) IN ('super_admin','operations_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY room_update ON room
        FOR UPDATE USING (
          location_id IN (
            SELECT l.id FROM location l
            WHERE CAST(l.provider_id AS text) = current_setting('app.current_provider_id', true)
          )
          OR current_setting('app.current_role', true) IN ('super_admin','operations_admin','content_admin')
        )
    `);

    // ── location ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE POLICY location_select ON location
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM provider p
            WHERE p.id = location.provider_id
              AND p.verification_status = 'VERIFIED'
          )
          OR CAST(provider_id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','content_admin','moderation_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY location_insert ON location
        FOR INSERT WITH CHECK (
          CAST(provider_id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true) IN ('super_admin','operations_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY location_update ON location
        FOR UPDATE USING (
          CAST(provider_id AS text) = current_setting('app.current_provider_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','content_admin','moderation_admin')
        )
    `);

    // ── events ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE POLICY events_select ON events
        FOR SELECT USING (
          status IN ('published','rsvp_open','sold_out','completed')
          OR CAST(organizer_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','content_admin','moderation_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY events_insert ON events
        FOR INSERT WITH CHECK (
          CAST(organizer_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true) IN ('super_admin','operations_admin')
        )
    `);
    await queryRunner.query(`
      CREATE POLICY events_update ON events
        FOR UPDATE USING (
          CAST(organizer_id AS text) = current_setting('app.current_user_id', true)
          OR current_setting('app.current_role', true)
            IN ('super_admin','operations_admin','content_admin','moderation_admin')
        )
    `);

    // ── event_rsvps ───────────────────────────────────────────────────────
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, name } of this.POLICIES) {
      await queryRunner.query(`DROP POLICY IF EXISTS "${name}" ON "${table}"`);
    }

    for (const table of this.TABLES) {
      const policyName = `app_user_all_${table}`;
      await queryRunner.query(`DROP POLICY IF EXISTS "${policyName}" ON "${table}"`);
      await queryRunner.query(`
        CREATE POLICY "${policyName}"
          ON "${table}"
          AS PERMISSIVE
          FOR ALL
          USING (true)
          WITH CHECK (true)
      `);
    }
  }
}
