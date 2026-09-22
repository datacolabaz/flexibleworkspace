import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 (Featured Listing) — a simple admin-only on/off flag per room.
 * No expiry date, no payment (confirmed with the product owner): admin
 * toggles it manually from the Listings section of the admin panel, and
 * the public homepage's "Featured venues" section shows whichever rooms
 * currently have it set, replacing that section's previous hardcoded
 * mock content.
 */
export class RoomFeatured1700000000012 implements MigrationInterface {
  name = 'RoomFeatured1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE room ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE INDEX idx_room_featured ON room (is_featured)
        WHERE deleted_at IS NULL AND status = 'ACTIVE' AND is_featured = TRUE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_room_featured;
      ALTER TABLE room DROP COLUMN IF EXISTS is_featured;
    `);
  }
}
