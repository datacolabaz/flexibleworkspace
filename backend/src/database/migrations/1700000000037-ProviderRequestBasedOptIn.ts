import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Product decision (2026-09-26, the owner's explicit ask): REQUEST_BASED
 * must never be the platform-wide default — most providers should never
 * have to manually accept/reject a booking; that's real work and the
 * default product model must not impose it on everyone. PAYMENT_BASED
 * (payment capture auto-confirms the booking; the provider only gets a
 * notification) stays the default for every provider. REQUEST_BASED is now
 * an explicit per-provider opt-in, via this new column, instead of being
 * selected by the platform-wide PAYMENTS_ENABLED flag alone
 * (BookingsService.create(), T4).
 *
 * PAYMENTS_ENABLED remains a platform-wide kill switch ABOVE this
 * preference (e.g. no payment gateway credentials configured yet) — when
 * it's false, every booking is still forced through REQUEST_BASED
 * regardless of any provider's own preference here. When it's true (the
 * normal case), this column is what actually decides a NEW booking's mode.
 *
 * Also flips the `booking.mode` column's own DEFAULT back to
 * 'PAYMENT_BASED'. Migration 1700000000017-BookingMode.ts deliberately set
 * it to 'REQUEST_BASED' for the Phase 1A rollout ("bookings created by app
 * code from this point on default to the new flow unless explicitly
 * says otherwise"). No application code has ever actually relied on that
 * DB-level default — BookingsService.create() always sets `mode` explicitly
 * on every insert — but leaving it pointed at REQUEST_BASED is a footgun
 * for any future insert that omits it, and it should agree with the new
 * default product decision either way.
 */
export class ProviderRequestBasedOptIn1700000000037 implements MigrationInterface {
  name = 'ProviderRequestBasedOptIn1700000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider
        ADD COLUMN request_based_enabled boolean NOT NULL DEFAULT false;

      ALTER TABLE booking
        ALTER COLUMN mode SET DEFAULT 'PAYMENT_BASED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE booking
        ALTER COLUMN mode SET DEFAULT 'REQUEST_BASED';

      ALTER TABLE provider DROP COLUMN IF EXISTS request_based_enabled;
    `);
  }
}
