import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Homepage ad slot (one placement, many campaigns, weighted rotation) plus
 * configurable footer social URLs. No advertiser billing.
 */
export class AdsAndSiteSettings1700000000036 implements MigrationInterface {
  name = 'AdsAndSiteSettings1700000000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE site_setting (
        key VARCHAR(80) PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_by UUID REFERENCES app_user(id),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      INSERT INTO site_setting (key, value) VALUES
        ('social.instagram', 'https://www.instagram.com/spotva.co'),
        ('social.facebook', 'https://www.facebook.com/profile.php?id=61595072692616'),
        ('social.tiktok', 'https://www.tiktok.com/@spotva.co'),
        ('social.linkedin', '')
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE ad_placement (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(80) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        rotation_interval_seconds INT NOT NULL DEFAULT 45,
        CONSTRAINT chk_ad_placement_interval CHECK (rotation_interval_seconds IN (30, 45, 60, 90))
      );

      INSERT INTO ad_placement (key, name, rotation_interval_seconds)
      VALUES ('homepage_sidebar', 'Homepage sidebar', 45)
      ON CONFLICT (key) DO NOTHING;

      CREATE TABLE ad_campaign (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        placement_id UUID NOT NULL REFERENCES ad_placement(id) ON DELETE CASCADE,
        active BOOLEAN NOT NULL DEFAULT FALSE,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        advertiser_name VARCHAR(160) NOT NULL,
        creative_url TEXT NOT NULL,
        click_url TEXT NOT NULL,
        weight INT NOT NULL DEFAULT 1,
        creative_size VARCHAR(16) NOT NULL DEFAULT '336x280',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_ad_campaign_weight CHECK (weight >= 1 AND weight <= 100),
        CONSTRAINT chk_ad_campaign_size CHECK (creative_size IN ('336x280', '300x250'))
      );

      CREATE INDEX idx_ad_campaign_placement_active ON ad_campaign (placement_id, active);

      CREATE TABLE ad_event (
        id BIGSERIAL PRIMARY KEY,
        campaign_id UUID NOT NULL REFERENCES ad_campaign(id) ON DELETE CASCADE,
        event_type VARCHAR(20) NOT NULL,
        client_event_id VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_ad_event_type CHECK (event_type IN ('impression', 'click'))
      );

      CREATE UNIQUE INDEX idx_ad_event_client_id ON ad_event (client_event_id)
        WHERE client_event_id IS NOT NULL;
      CREATE INDEX idx_ad_event_campaign_type ON ad_event (campaign_id, event_type);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS ad_event;
      DROP TABLE IF EXISTS ad_campaign;
      DROP TABLE IF EXISTS ad_placement;
      DROP TABLE IF EXISTS site_setting;
    `);
  }
}
