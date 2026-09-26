import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 2 — PostgreSQL Row Level Security (RLS) as defense-in-depth.
 *
 * Strategy:
 *   1. Enable RLS on all critical tables (booking, ledger_entry, payout,
 *      provider, app_user, room, location, event, event_rsvp).
 *   2. FORCE RLS so it applies even to the table owner.
 *   3. Create a permissive ALL policy for the application DB user
 *      `spotva_app` — this preserves current behavior while enabling RLS
 *      infrastructure. Any connection not running as `spotva_app` will be
 *      denied by default (no matching policy = deny).
 *
 * IMPORTANT: The actual PostgreSQL role that the NestJS application uses
 * MUST be `spotva_app`. If your environment uses a different role name,
 * update the role in each `CREATE POLICY` statement and the `TO` clause
 * below. The policies below are intentionally permissive (USING (true))
 * so that no application logic is broken — tighter per-row attribute
 * checks can be layered on top in future migrations.
 *
 * Future tightening plan (do NOT enable in this migration):
 *   - booking: USING (user_id = current_setting('app.current_user_id',true)::uuid)
 *     for customer-facing reads; provider-facing reads need a join to room→location→provider.
 *   - event_rsvp: USING (user_id = current_setting('app.current_user_id',true)::uuid)
 *   - app_user: USING (id = current_setting('app.current_user_id',true)::uuid)
 *     but only for non-admin roles.
 *   Implement via a separate migration after adding `SET LOCAL app.current_user_id`
 *   calls at the start of each service transaction.
 */
export class RowLevelSecurity1700000000023 implements MigrationInterface {
  name = 'RowLevelSecurity1700000000023';

  /** Tables that receive RLS. Order does not matter for ENABLE/FORCE. */
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

  /** Application DB role. Update if your role differs from `spotva_app`. */
  private readonly APP_ROLE = 'spotva_app';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enable & force RLS on each table ───────────────────────────────
    for (const table of this.TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
      `);
      // FORCE RLS applies the policy to the table owner as well — without
      // this, a connection running as the DB user who created the table
      // bypasses all policies (Postgres default).
      await queryRunner.query(`
        ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
      `);
    }

    // ── 2. Permissive ALL policy for the application role ─────────────────
    // USING (true) + WITH CHECK (true) = allow every SELECT/INSERT/UPDATE/DELETE
    // performed by `spotva_app`. Any other role gets no matching policy and
    // therefore sees zero rows / cannot write.
    for (const table of this.TABLES) {
      const policyName = `app_user_all_${table}`;
      await queryRunner.query(`
        CREATE POLICY "${policyName}"
          ON "${table}"
          AS PERMISSIVE
          FOR ALL
          TO "${this.APP_ROLE}"
          USING (true)
          WITH CHECK (true);
      `);
    }

    // ── 3. Ownership-comment policies (informational / future) ────────────
    // The following is a COMMENT documenting the intended future per-row
    // policies. They are NOT created here because application code does not
    // yet set `app.current_user_id` via `SET LOCAL` in transactions.
    //
    // Future: add per-customer row visibility for bookings:
    //   CREATE POLICY "customer_own_bookings" ON "booking"
    //     AS PERMISSIVE FOR SELECT
    //     TO spotva_app
    //     USING (
    //       user_id = current_setting('app.current_user_id', true)::uuid
    //       -- OR the connected role is a provider/admin (checked via role column
    //       -- or a separate session variable app.current_role)
    //     );
    //
    // Future: add per-user row visibility for event_rsvps:
    //   CREATE POLICY "user_own_rsvps" ON "event_rsvps"
    //     AS PERMISSIVE FOR SELECT
    //     TO spotva_app
    //     USING (user_id = current_setting('app.current_user_id', true)::uuid);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop policies first, then disable RLS.
    for (const table of this.TABLES) {
      const policyName = `app_user_all_${table}`;
      await queryRunner.query(`
        DROP POLICY IF EXISTS "${policyName}" ON "${table}";
      `);
      await queryRunner.query(`
        ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY;
      `);
    }
  }
}
