import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Task 3 — Admin MFA/2FA via TOTP (Time-based One-Time Password).
 *
 * Adds two columns to `app_user`:
 *   • totp_secret VARCHAR(255) NULL  — the base32-encoded shared secret,
 *     stored encrypted at rest by the DB or application (see AuthService).
 *     NULL until the admin completes TOTP setup.
 *   • totp_enabled BOOLEAN DEFAULT false NOT NULL — flag flipped to true
 *     once the admin has verified the first TOTP token after setup.
 *
 * The admin login flow becomes:
 *   1. POST /auth/admin/login — validates password, checks totp_enabled.
 *   2. If totp_enabled=true, returns { requiresTotp: true, userId }.
 *   3. POST /auth/admin/totp/login — validates TOTP token, issues JWT.
 */
export class AdminTotp1700000000024 implements MigrationInterface {
  name = 'AdminTotp1700000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_user"
        ADD COLUMN IF NOT EXISTS "totp_secret"  VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS "totp_enabled" BOOLEAN     NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_user"
        DROP COLUMN IF EXISTS "totp_secret",
        DROP COLUMN IF EXISTS "totp_enabled";
    `);
  }
}
