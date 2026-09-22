import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A provider flagged that `/list-your-space` (self-registration) has no
 * way to add a photo at all — `provider` had no image column of any kind
 * (photos only ever attached to a `room`, via `photo.room_id`). This adds
 * one optional logo/cover image for the BUSINESS itself, set right after
 * registration (`POST providers/:id/logo`) — separate from room photos,
 * and separate from the provider verification documents (private, never
 * publicly served) added by 1700000000009.
 */
export class ProviderLogo1700000000013 implements MigrationInterface {
  name = 'ProviderLogo1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider ADD COLUMN logo_storage_key VARCHAR(500) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider DROP COLUMN IF EXISTS logo_storage_key;
    `);
  }
}
