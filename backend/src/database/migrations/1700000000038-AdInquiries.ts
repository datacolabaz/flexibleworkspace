import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bug report (2026-09-27): `/advertise` listed inventory and pricing but
 * gave a prospective advertiser no way to actually submit their creative
 * and place an order — no email, no form, nothing (the page's "See the
 * partner model" CTA just looped to `/partners`, which pointed straight
 * back to `/advertise`). `ad_inquiry` gives that page a real intake: name/
 * phone/optional email+company+message, publicly submittable with no
 * account, landing in an admin inbox (`AdminAdsController`'s new
 * `ads/inquiries` routes) so an admin can follow up and — once creative
 * and payment are settled off-platform — create the actual `ad_campaign`
 * row by hand, same as today. Modeled directly on `lead` (the
 * 1700000000011-Leads migration's identical "no payment gateway / no
 * self-service yet, so capture interest for manual follow-up" reasoning),
 * minus `room_id`/`provider_id`: an ad inquiry isn't about one room.
 */
export class AdInquiries1700000000038 implements MigrationInterface {
  name = 'AdInquiries1700000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE ad_inquiry_status AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

      CREATE TABLE ad_inquiry (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_name VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(50) NOT NULL,
        contact_email VARCHAR(255),
        company_name VARCHAR(255),
        message TEXT,
        status ad_inquiry_status NOT NULL DEFAULT 'NEW',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        contacted_at TIMESTAMPTZ,
        contacted_by_user_id UUID REFERENCES app_user(id)
      );

      CREATE INDEX idx_ad_inquiry_created_at ON ad_inquiry(created_at);
      CREATE INDEX idx_ad_inquiry_status ON ad_inquiry(status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS ad_inquiry;
      DROP TYPE IF EXISTS ad_inquiry_status;
    `);
  }
}
