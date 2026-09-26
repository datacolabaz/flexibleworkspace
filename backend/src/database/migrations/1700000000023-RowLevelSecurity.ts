import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 2 — PostgreSQL Row Level Security (RLS) as defense-in-depth.
 *
 * Strategy:
 *   1. Enable RLS on all critical tables (booking, ledger_entry, payout,
 *      provider, app_user, room, location, event, event_rsvp).
 *   2. FORCE RLS so it applies even to the table owner.
 *   3. Create a permissive ALL policy WITHOUT a TO clause — this means the
 *      policy applies to PUBLIC (all roles), relying on application-layer
 *      auth for ownership enforcement. This avoids hardcoding a specific DB
 *      role name that may differ across environments (Railway uses DB_USERNAME
 *      / POSTGRES_USER, which varies per project).
 *
 * Policy intentionally permissive — application layer enforces ownership.
 * Tighten per-row ownership policies in a future migration once DB roles
 * are finalized and `SET LOCAL app.current_user_id` calls are added to
 * service transactions.
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

    // ── 2. Permissive ALL policy (no TO clause = applies to PUBLIC) ───────
    // USING (true) + WITH CHECK (true) = allow every SELECT/INSERT/UPDATE/DELETE.
    // No TO clause is used so the policy applies to all roles regardless of
    // the DB username in use (Railway's POSTGRES_USER / DB_USERNAME varies
    // per project; hardcoding a role name would break the migration on any
    // environment where that role does not exist).
    // Policy intentionally permissive — application layer enforces ownership.
    // Tighten per-row ownership policies in a future migration once DB roles
    // are finalized.
    for (const table of this.TABLES) {
      const policyName = `app_user_all_${table}`;
      await queryRunner.query(`
        CREATE POLICY "${policyName}"
          ON "${table}"
          AS PERMISSIVE
          FOR ALL
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
    //     USING (
    //       user_id = current_setting('app.current_user_id', true)::uuid
    //       -- OR the connected role is a provider/admin (checked via role column
    //       -- or a separate session variable app.current_role)
    //     );
    //
    // Future: add per-user row visibility for event_rsvps:
    //   CREATE POLICY "user_own_rsvps" ON "event_rsvps"
    //     AS PERMISSIVE FOR SELECT
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
