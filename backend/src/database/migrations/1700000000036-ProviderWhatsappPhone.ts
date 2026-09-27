import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional business WhatsApp number for post-confirm customer contact.
 * Deep-links only; messages are not stored.
 */
export class ProviderWhatsappPhone1700000000036 implements MigrationInterface {
  name = 'ProviderWhatsappPhone1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider
        ADD COLUMN IF NOT EXISTS whatsapp_phone VARCHAR(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE provider DROP COLUMN IF EXISTS whatsapp_phone
    `);
  }
}
