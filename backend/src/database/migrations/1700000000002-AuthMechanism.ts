import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PHASE 4 ADDITION — justified, minimal, additive schema change.
 *
 * Phase 2 (09_DOMAIN_MODEL.md / 28_DATABASE_DDL.sql) modeled the BUSINESS
 * domain (users, providers, bookings, payments, ...) but did not model the
 * auth MECHANISM itself (OTP codes, refresh-token rotation state) — that is
 * an implementation detail of "how a User authenticates," not a business
 * entity, and Phase 1 (11_API_CONTRACTS.md §11.4) specifies passwordless
 * OTP + rotated refresh tokens without prescribing their storage.
 *
 * This migration adds exactly two small tables to make that specification
 * real:
 *   - otp_code: short-lived, hashed one-time codes for passwordless login
 *   - refresh_token: rotated refresh tokens with revocation support, so a
 *     compromised refresh token can actually be invalidated (18_SECURITY.md
 *     "secure session/JWT rotation") rather than being valid until natural
 *     expiry no matter what.
 *
 * No existing Phase 2 table is altered. This does not change the approved
 * domain model, business rules, or any entity in 09_DOMAIN_MODEL.md.
 */
export class AuthMechanism1700000000002 implements MigrationInterface {
  name = 'AuthMechanism1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE otp_code (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        identifier    VARCHAR(255) NOT NULL,     -- email or phone, as submitted
        code_hash     TEXT NOT NULL,
        purpose       VARCHAR(30) NOT NULL DEFAULT 'LOGIN',
        expires_at    TIMESTAMPTZ NOT NULL,
        consumed_at   TIMESTAMPTZ,
        attempt_count INT NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_otp_code_identifier ON otp_code (identifier, created_at DESC);

      CREATE TABLE refresh_token (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        token_hash     TEXT NOT NULL,
        expires_at     TIMESTAMPTZ NOT NULL,
        revoked_at     TIMESTAMPTZ,
        replaced_by_id UUID REFERENCES refresh_token(id),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_refresh_token_user ON refresh_token (user_id);
      CREATE UNIQUE INDEX uq_refresh_token_hash ON refresh_token (token_hash);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS refresh_token CASCADE;
      DROP TABLE IF EXISTS otp_code CASCADE;
    `);
  }
}
