import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 4 ADDITION — adds Google / Facebook "Sign in with X" as an
 * ADDITIONAL login mechanism alongside the existing OTP flow (never a
 * replacement — 11_API_CONTRACTS.md §11.4's OTP contract is untouched;
 * both remain available on the login screen).
 *
 * Same framing as AuthMechanism1700000000002: this is auth MECHANISM, not
 * business domain — one small additive table, no existing table altered.
 *
 * oauth_identity links an app_user to a (provider, provider_user_id) pair.
 * The SAME app_user row is reused (never duplicated) when the provider's
 * verified email matches an existing account — AuthService's
 * findOrCreateUserForOAuth owns that linking decision; this table only
 * stores the result, one row per linked provider per user.
 */
export class OAuthIdentities1700000000005 implements MigrationInterface {
  name = 'OAuthIdentities1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oauth_identity (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        provider          VARCHAR(20) NOT NULL,        -- 'GOOGLE' | 'FACEBOOK'
        provider_user_id  VARCHAR(255) NOT NULL,       -- Google sub / Facebook id
        email             CITEXT,                      -- provider-reported email at link time, audit only — app_user.email stays authoritative
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX uq_oauth_identity_provider_user ON oauth_identity (provider, provider_user_id);
      CREATE INDEX idx_oauth_identity_user ON oauth_identity (user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS oauth_identity CASCADE;
    `);
  }
}
