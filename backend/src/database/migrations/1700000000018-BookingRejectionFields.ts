import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T4 (Phase 1A — Request-Based Booking, provider accept/reject) — columns
 * to record WHY and BY WHOM a REQUEST_BASED booking was rejected, read back
 * by BookingsService.notifyCustomer() for the customer-facing notification.
 * Additive only; no existing column is touched.
 */
export class BookingRejectionFields1700000000018 implements MigrationInterface {
  name = 'BookingRejectionFields1700000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE booking
        ADD COLUMN rejection_reason VARCHAR(30),
        ADD COLUMN rejection_note VARCHAR(500),
        ADD COLUMN rejected_at TIMESTAMPTZ,
        ADD COLUMN rejected_by_user_id UUID REFERENCES app_user(id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE booking
        DROP COLUMN IF EXISTS rejection_reason,
        DROP COLUMN IF EXISTS rejection_note,
        DROP COLUMN IF EXISTS rejected_at,
        DROP COLUMN IF EXISTS rejected_by_user_id;
    `);
  }
}
