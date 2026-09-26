import { MigrationInterface, QueryRunner } from 'typeorm';

const MIGRATION_NOTE =
  'Provider auto-verified: document verification requirement removed.';

/**
 * Provider onboarding no longer requires identity or business documents.
 * Existing PENDING accounts become usable immediately, while REJECTED and
 * SUSPENDED accounts keep their administrative restrictions.
 */
export class RemoveProviderDocumentVerificationRequirement1700000000019 implements MigrationInterface {
  name = 'RemoveProviderDocumentVerificationRequirement1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider
        ALTER COLUMN verification_status SET DEFAULT 'VERIFIED';

      WITH transitioned AS (
        UPDATE provider
        SET verification_status = 'VERIFIED', updated_at = now()
        WHERE verification_status = 'PENDING'
        RETURNING id
      )
      INSERT INTO provider_verification_event (
        provider_id,
        status,
        reviewed_by_user_id,
        notes,
        created_at
      )
      SELECT id, 'VERIFIED', NULL, '${MIGRATION_NOTE}', now()
      FROM transitioned;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider
        ALTER COLUMN verification_status SET DEFAULT 'PENDING';

      WITH reverted AS (
        DELETE FROM provider_verification_event
        WHERE notes = '${MIGRATION_NOTE}'
        RETURNING provider_id
      )
      UPDATE provider
      SET verification_status = 'PENDING', updated_at = now()
      WHERE id IN (SELECT provider_id FROM reverted)
        AND verification_status = 'VERIFIED';
    `);
  }
}
