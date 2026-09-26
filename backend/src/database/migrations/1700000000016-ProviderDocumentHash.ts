import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Historical table that backed the former provider-document fraud check — the
 * owner's explicit ask (2026-09-23): stop the same person reusing the same
 * ID/business-registration document to spin up a second account and dodge
 * the FREE-plan one-room limit. `file_hash` is a SHA-256 of the uploaded
 * bytes; the unique index is a race-safety net for two concurrent uploads
 * of the identical file under different accounts — the primary business
 * decision (same-provider re-upload is fine, different-provider is not)
 * is made in the service layer, which already knows the existing row's
 * provider_id before this index would ever fire.
 */
export class ProviderDocumentHash1700000000016 implements MigrationInterface {
  name = 'ProviderDocumentHash1700000000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE provider_document_hash (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES provider(id),
        file_hash VARCHAR(64) NOT NULL,
        document_type VARCHAR(30) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX idx_provider_document_hash_file_hash ON provider_document_hash(file_hash);
      CREATE INDEX idx_provider_document_hash_provider_id ON provider_document_hash(provider_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS provider_document_hash;
    `);
  }
}
