import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 1 — Per-room 'Qaydalar' (rules/policies) field.
 * Adds a nullable TEXT column `rules` to the `room` table.
 * Existing rooms receive NULL (no rules set) — unaffected.
 */
export class RoomRules1700000000022 implements MigrationInterface {
  name = 'RoomRules1700000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "room"
        ADD COLUMN IF NOT EXISTS "rules" TEXT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "room"
        DROP COLUMN IF EXISTS "rules";
    `);
  }
}
