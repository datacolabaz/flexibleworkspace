import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Provider Listing Media Specification §2/§11 — adds an optional single
 * video to a `room` (PRO/ENTERPRISE plans only, enforced in application
 * code via `canUploadVideo`/`getMaxVideoDurationSeconds`/
 * `getMaxVideoSizeBytes` in `provider.enum.ts`, not by a DB constraint,
 * matching how photo-per-room limits are already enforced application-side
 * rather than in SQL). Columns live directly on `room` rather than a
 * separate table since it's always zero-or-one per room — same reasoning
 * as `provider.logo_storage_key` (1700000000013) for the business logo.
 *
 * `video_size_bytes` is `BIGINT` even though the spec caps video at 20MB
 * (well within `INT` range) so a future limit increase never needs a
 * column-width migration. `video_duration_seconds` is only ever set from
 * a client-reported value verified against `getMaxVideoDurationSeconds`
 * at confirm time — duration can't be verified server-side without
 * downloading/probing the file, an accepted limitation (see the media
 * confirm endpoint).
 */
export class RoomVideo1700000000014 implements MigrationInterface {
  name = 'RoomVideo1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE room ADD COLUMN video_storage_key VARCHAR(500) NULL;
      ALTER TABLE room ADD COLUMN video_duration_seconds INT NULL;
      ALTER TABLE room ADD COLUMN video_size_bytes BIGINT NULL;
      ALTER TABLE room ADD COLUMN video_mime_type VARCHAR(100) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE room DROP COLUMN IF EXISTS video_storage_key;
      ALTER TABLE room DROP COLUMN IF EXISTS video_duration_seconds;
      ALTER TABLE room DROP COLUMN IF EXISTS video_size_bytes;
      ALTER TABLE room DROP COLUMN IF EXISTS video_mime_type;
    `);
  }
}
