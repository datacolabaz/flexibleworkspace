import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T1 (Phase 1A — Request-Based Booking) — introduces `booking.mode` so a
 * NEW, no-payment "request → provider accepts/rejects" flow can be added
 * (T2–T8, T13) WITHOUT touching the existing PAYMENT_BASED flow at all.
 *
 * Every row that exists before this migration runs is the old payment-first
 * flow, so the column is added with DEFAULT 'PAYMENT_BASED' — every existing
 * booking is backfilled to PAYMENT_BASED for free, no separate UPDATE pass
 * needed. Only after that do we flip the column default to 'REQUEST_BASED',
 * so bookings created by app code from this point on default to the new
 * flow unless the booking-creation code explicitly says otherwise.
 *
 * The three new booking_status values (REJECTED, CANCELLED_BY_USER,
 * CANCELLED_BY_PROVIDER) are for the REQUEST_BASED flow's own transition
 * table (T2, not part of this migration). They are intentionally left out
 * of the `no_overlapping_bookings` exclusion constraint's status list
 * (still just PENDING/PAYMENT_PENDING/CONFIRMED, unchanged) — a rejected or
 * cancelled request must never hold a slot.
 */
export class BookingMode1700000000017 implements MigrationInterface {
  name = 'BookingMode1700000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE booking_mode AS ENUM ('REQUEST_BASED', 'PAYMENT_BASED');

      ALTER TABLE booking
        ADD COLUMN mode booking_mode NOT NULL DEFAULT 'PAYMENT_BASED';

      ALTER TABLE booking
        ALTER COLUMN mode SET DEFAULT 'REQUEST_BASED';

      ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'REJECTED';
      ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'CANCELLED_BY_USER';
      ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'CANCELLED_BY_PROVIDER';
    `);

    await queryRunner.query(`
      CREATE INDEX idx_booking_mode_status ON booking (mode, status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres cannot drop a single enum value, so a down migration cannot
    // fully reverse the booking_status additions without recreating the
    // type; since the column/index removal is enough to make the app code
    // revert cleanly (nothing reads the 3 new statuses outside the
    // not-yet-built REQUEST_BASED transition table), that's all we undo.
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_booking_mode_status;
      ALTER TABLE booking DROP COLUMN IF EXISTS mode;
      DROP TYPE IF EXISTS booking_mode;
    `);
  }
}
