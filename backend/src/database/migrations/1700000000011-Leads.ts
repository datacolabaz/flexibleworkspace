import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 3 (Lead Tracking) — until the payment gateway is live
 * (25_PROVIDER_ARCHITECTURE.md / the owner's own "no payment integration
 * for initial launch" decision), a customer can't complete a self-service
 * paid booking. `lead` gives them a way to express interest (name, phone,
 * optional message) from a room's public page without needing an account
 * or payment, so the provider can follow up and close the booking
 * manually in the meantime — the same "supply first, high-touch ops"
 * posture 26_ROADMAP.md already takes for onboarding providers.
 */
export class Leads1700000000011 implements MigrationInterface {
  name = 'Leads1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE lead_status AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED');

      CREATE TABLE lead (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES room(id),
        provider_id UUID NOT NULL REFERENCES provider(id),
        customer_name VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,
        customer_email VARCHAR(255),
        message TEXT,
        status lead_status NOT NULL DEFAULT 'NEW',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        contacted_at TIMESTAMPTZ,
        contacted_by_user_id UUID REFERENCES app_user(id)
      );

      CREATE INDEX idx_lead_provider_id ON lead(provider_id);
      CREATE INDEX idx_lead_room_id ON lead(room_id);
      CREATE INDEX idx_lead_created_at ON lead(created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS lead;
      DROP TYPE IF EXISTS lead_status;
    `);
  }
}
