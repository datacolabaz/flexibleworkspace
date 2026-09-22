import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 25_PROVIDER_ARCHITECTURE.md / Sprint 1 (provider verification) — adds
 * storage for the documents a provider submits as proof for manual admin
 * review (ID, business registration, address proof). Modeled as a JSONB
 * array on `provider` (same "small, append-mostly, no independent query
 * needs" reasoning as `provider.bank_account_details`) rather than a new
 * table, since documents are only ever read as "all of this provider's
 * submitted documents" — never filtered/joined across providers.
 */
export class ProviderVerificationDocuments1700000000009 implements MigrationInterface {
  name = 'ProviderVerificationDocuments1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider
      ADD COLUMN IF NOT EXISTS verification_documents JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider DROP COLUMN IF EXISTS verification_documents;
    `);
  }
}
