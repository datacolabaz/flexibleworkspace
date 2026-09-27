import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace supply taxonomy, published price packages, billing-unit
 * commission_rule rows, booking_item billing snapshot, and offline-lead
 * attribution (no auto commission).
 */
export class MarketplaceSupplyPricing1700000000037 implements MigrationInterface {
  name = 'MarketplaceSupplyPricing1700000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE location_categories
        ADD COLUMN IF NOT EXISTS marketplace_slug VARCHAR(64),
        ADD COLUMN IF NOT EXISTS is_marketplace BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await queryRunner.query(`
      INSERT INTO location_categories (slug, name_az, name_en, sort_order, is_marketplace, marketplace_slug) VALUES
        ('TRAINING_ROOM', 'Təlim otağı', 'Training Room', 101, TRUE, 'TRAINING_ROOM'),
        ('WORKSHOP_SPACE', 'Workshop sahəsi', 'Workshop Space', 102, TRUE, 'WORKSHOP_SPACE'),
        ('PHOTO_VIDEO_STUDIO', 'Foto və video studiyası', 'Photo & Video Studio', 103, TRUE, 'PHOTO_VIDEO_STUDIO'),
        ('PODCAST_STUDIO', 'Podkast studiyası', 'Podcast Studio', 104, TRUE, 'PODCAST_STUDIO'),
        ('YOGA_DANCE_STUDIO', 'Yoga / rəqs studiyası', 'Yoga / Dance Studio', 105, TRUE, 'YOGA_DANCE_STUDIO'),
        ('RESTAURANT_HOTEL_EVENT_SPACE', 'Restoran / otel tədbir məkanı', 'Restaurant / Hotel Event Space', 106, TRUE, 'RESTAURANT_HOTEL_EVENT_SPACE'),
        ('SMALL_EVENT_SPACE', 'Kiçik tədbir məkanı', 'Small Event Space', 107, TRUE, 'SMALL_EVENT_SPACE'),
        ('CREATIVE_COMMUNITY_SPACE', 'Yaradıcı / icma məkanı', 'Creative / Community Space', 108, TRUE, 'CREATIVE_COMMUNITY_SPACE'),
        ('MEETING_ROOM', 'İclas otağı', 'Meeting Room', 109, TRUE, 'MEETING_ROOM'),
        ('COWORKING_SPACE', 'Kovorkinq məkanı', 'Coworking Space', 110, TRUE, 'COWORKING_SPACE')
      ON CONFLICT (slug) DO UPDATE SET
        is_marketplace = TRUE,
        marketplace_slug = EXCLUDED.marketplace_slug,
        name_az = EXCLUDED.name_az,
        name_en = EXCLUDED.name_en;
    `);

    await queryRunner.query(`
      UPDATE location_categories SET marketplace_slug = 'TRAINING_ROOM' WHERE slug IN ('telim-otagi','sinif-otagi','seminar-otagi');
      UPDATE location_categories SET marketplace_slug = 'WORKSHOP_SPACE' WHERE slug IN ('workshop-otagi','emalatxana');
      UPDATE location_categories SET marketplace_slug = 'PHOTO_VIDEO_STUDIO' WHERE slug IN ('foto-video-studiya','studiya');
      UPDATE location_categories SET marketplace_slug = 'PODCAST_STUDIO' WHERE slug IN ('podkast-studiyasi','ses-studiyasi');
      UPDATE location_categories SET marketplace_slug = 'YOGA_DANCE_STUDIO' WHERE slug IN ('spor-zal','rehearsal-space');
      UPDATE location_categories SET marketplace_slug = 'RESTAURANT_HOTEL_EVENT_SPACE' WHERE slug = 'kafe-restoran';
      UPDATE location_categories SET marketplace_slug = 'SMALL_EVENT_SPACE' WHERE slug = 'tdbir-mkani';
      UPDATE location_categories SET marketplace_slug = 'CREATIVE_COMMUNITY_SPACE' WHERE slug = 'outdoor-space';
      UPDATE location_categories SET marketplace_slug = 'MEETING_ROOM' WHERE slug IN ('icas-otagi','konfrans-otagi');
      UPDATE location_categories SET marketplace_slug = 'COWORKING_SPACE' WHERE slug IN ('coworking','ofis-sahesi','ferdi-ofis');
    `);

    await queryRunner.query(`
      UPDATE provider
      SET categories = COALESCE((
        SELECT jsonb_agg(DISTINCT mapped)
        FROM jsonb_array_elements_text(COALESCE(categories, '[]'::jsonb)) AS raw(slug)
        JOIN LATERAL (
          SELECT COALESCE(lc.marketplace_slug, raw.slug) AS mapped
          FROM location_categories lc
          WHERE lc.slug = raw.slug
          UNION ALL
          SELECT raw.slug WHERE NOT EXISTS (SELECT 1 FROM location_categories lc2 WHERE lc2.slug = raw.slug)
        ) m ON TRUE
        WHERE mapped IS NOT NULL AND mapped <> ''
      ), '[]'::jsonb)
      WHERE categories IS NOT NULL AND categories <> '[]'::jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE room_type
        ADD COLUMN IF NOT EXISTS marketplace_slug VARCHAR(64);
    `);

    await queryRunner.query(`
      INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight, marketplace_slug)
      SELECT gen_random_uuid(), 'room_type.yoga_dance_studio', NULL, 1, 40, 0.85, 'YOGA_DANCE_STUDIO'
      WHERE NOT EXISTS (SELECT 1 FROM room_type WHERE translation_key = 'room_type.yoga_dance_studio');

      INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight, marketplace_slug)
      SELECT gen_random_uuid(), 'room_type.restaurant_hotel_event_space', NULL, 10, 400, 0.80, 'RESTAURANT_HOTEL_EVENT_SPACE'
      WHERE NOT EXISTS (SELECT 1 FROM room_type WHERE translation_key = 'room_type.restaurant_hotel_event_space');

      INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight, marketplace_slug)
      SELECT gen_random_uuid(), 'room_type.small_event_space', NULL, 8, 80, 0.85, 'SMALL_EVENT_SPACE'
      WHERE NOT EXISTS (SELECT 1 FROM room_type WHERE translation_key = 'room_type.small_event_space');

      INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight, marketplace_slug)
      SELECT gen_random_uuid(), 'room_type.creative_community_space', NULL, 4, 80, 0.80, 'CREATIVE_COMMUNITY_SPACE'
      WHERE NOT EXISTS (SELECT 1 FROM room_type WHERE translation_key = 'room_type.creative_community_space');

      INSERT INTO room_type (id, translation_key, parent_type_id, default_capacity_min, default_capacity_max, search_facet_weight, marketplace_slug)
      SELECT gen_random_uuid(), 'room_type.coworking_space', NULL, 1, 50, 1.25, 'COWORKING_SPACE'
      WHERE NOT EXISTS (SELECT 1 FROM room_type WHERE translation_key = 'room_type.coworking_space');
    `);

    await queryRunner.query(`
      UPDATE room_type SET marketplace_slug = 'MEETING_ROOM'
        WHERE translation_key IN ('room_type.meeting_room','room_type.business_meeting_room','room_type.interview_room','room_type.conference_room');
      UPDATE room_type SET marketplace_slug = 'COWORKING_SPACE'
        WHERE translation_key IN ('room_type.coworking_desk','room_type.private_office','room_type.coworking_space');
      UPDATE room_type SET marketplace_slug = 'TRAINING_ROOM'
        WHERE translation_key IN ('room_type.training_room','room_type.classroom','room_type.seminar_room','room_type.tutor_teacher_room');
      UPDATE room_type SET marketplace_slug = 'WORKSHOP_SPACE' WHERE translation_key = 'room_type.workshop_space';
      UPDATE room_type SET marketplace_slug = 'PODCAST_STUDIO' WHERE translation_key = 'room_type.podcast_studio';
      UPDATE room_type SET marketplace_slug = 'PHOTO_VIDEO_STUDIO' WHERE translation_key = 'room_type.photo_video_studio';
      UPDATE room_type SET marketplace_slug = 'SMALL_EVENT_SPACE' WHERE translation_key IN ('room_type.event_space','room_type.small_event_space');
      UPDATE room_type SET marketplace_slug = 'YOGA_DANCE_STUDIO' WHERE translation_key = 'room_type.yoga_dance_studio';
      UPDATE room_type SET marketplace_slug = 'RESTAURANT_HOTEL_EVENT_SPACE' WHERE translation_key = 'room_type.restaurant_hotel_event_space';
      UPDATE room_type SET marketplace_slug = 'CREATIVE_COMMUNITY_SPACE' WHERE translation_key = 'room_type.creative_community_space';
    `);

    await queryRunner.query(`
      UPDATE room_type SET parent_type_id = (
        SELECT id FROM room_type WHERE translation_key = 'room_type.coworking_space' LIMIT 1
      )
      WHERE translation_key = 'room_type.coworking_desk'
        AND parent_type_id IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS room_price_package (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id UUID NOT NULL REFERENCES room(id) ON DELETE CASCADE,
        unit_type VARCHAR(32) NOT NULL,
        amount BIGINT,
        currency CHAR(3) NOT NULL DEFAULT 'AZN',
        min_duration INT,
        max_duration INT,
        billing_unit VARCHAR(32) NOT NULL,
        tax_included BOOLEAN NOT NULL DEFAULT TRUE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        valid_from TIMESTAMPTZ,
        valid_until TIMESTAMPTZ,
        last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        price_type VARCHAR(32) NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_room_price_package_unit CHECK (
          unit_type IN ('HOURLY','DAILY','WEEKLY','MONTHLY','CUSTOM_QUOTE')
        ),
        CONSTRAINT chk_room_price_package_price_type CHECK (
          price_type IN ('EXACT','FROM','REQUEST','NOT_AVAILABLE')
        ),
        CONSTRAINT uq_room_price_package_room_unit UNIQUE (room_id, unit_type)
      );
      CREATE INDEX IF NOT EXISTS idx_room_price_package_room ON room_price_package (room_id) WHERE active = TRUE;
    `);

    await queryRunner.query(`
      INSERT INTO room_price_package (
        room_id, unit_type, amount, currency, billing_unit, tax_included, active,
        last_updated_at, price_type, created_at, updated_at
      )
      SELECT r.id, 'HOURLY', r.base_price_amount, COALESCE(NULLIF(r.base_price_currency, ''), 'AZN'),
             'HOURLY', TRUE, TRUE, r.updated_at, 'EXACT', now(), now()
      FROM room r
      WHERE r.deleted_at IS NULL
        AND r.base_price_amount IS NOT NULL
        AND r.base_price_amount > 0
      ON CONFLICT (room_id, unit_type) DO NOTHING;
    `);

    await queryRunner.query(`
      ALTER TABLE commission_rule
        ADD COLUMN IF NOT EXISTS billing_unit VARCHAR(32);
    `);

    await queryRunner.query(`
      INSERT INTO commission_rule (id, scope, percentage, billing_unit, priority, starts_at)
      SELECT gen_random_uuid(), 'PLATFORM_DEFAULT', 12.00, 'HOURLY', 20, now()
      WHERE NOT EXISTS (SELECT 1 FROM commission_rule WHERE scope = 'PLATFORM_DEFAULT' AND billing_unit = 'HOURLY');

      INSERT INTO commission_rule (id, scope, percentage, billing_unit, priority, starts_at)
      SELECT gen_random_uuid(), 'PLATFORM_DEFAULT', 12.00, 'DAILY', 20, now()
      WHERE NOT EXISTS (SELECT 1 FROM commission_rule WHERE scope = 'PLATFORM_DEFAULT' AND billing_unit = 'DAILY');

      INSERT INTO commission_rule (id, scope, percentage, billing_unit, priority, starts_at)
      SELECT gen_random_uuid(), 'PLATFORM_DEFAULT', 10.00, 'WEEKLY', 20, now()
      WHERE NOT EXISTS (SELECT 1 FROM commission_rule WHERE scope = 'PLATFORM_DEFAULT' AND billing_unit = 'WEEKLY');

      INSERT INTO commission_rule (id, scope, percentage, billing_unit, priority, starts_at)
      SELECT gen_random_uuid(), 'PLATFORM_DEFAULT', 8.00, 'MONTHLY', 20, now()
      WHERE NOT EXISTS (SELECT 1 FROM commission_rule WHERE scope = 'PLATFORM_DEFAULT' AND billing_unit = 'MONTHLY');
    `);

    await queryRunner.query(`
      UPDATE commission_rule cr
      SET percentage = 12.00
      FROM room_type rt
      WHERE cr.scope = 'CATEGORY' AND cr.room_type_id = rt.id
        AND rt.translation_key = 'room_type.event_space';
    `);

    await queryRunner.query(`
      INSERT INTO commission_rule (id, scope, room_type_id, percentage, priority, starts_at)
      SELECT gen_random_uuid(), 'CATEGORY', rt.id, 12.00, 10, now()
      FROM room_type rt
      WHERE rt.translation_key IN (
        'room_type.workshop_space',
        'room_type.small_event_space',
        'room_type.restaurant_hotel_event_space',
        'room_type.yoga_dance_studio'
      )
      AND NOT EXISTS (
        SELECT 1 FROM commission_rule c2
        WHERE c2.scope = 'CATEGORY' AND c2.room_type_id = rt.id AND c2.billing_unit IS NULL
      );
    `);

    await queryRunner.query(`
      ALTER TABLE booking_item
        ADD COLUMN IF NOT EXISTS billing_unit VARCHAR(32);
    `);

    await queryRunner.query(`
      ALTER TABLE lead
        ADD COLUMN IF NOT EXISTS attribution_source VARCHAR(100),
        ADD COLUMN IF NOT EXISTS converted_booking_id UUID REFERENCES booking(id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lead
        DROP COLUMN IF EXISTS converted_booking_id,
        DROP COLUMN IF EXISTS attribution_source;
      ALTER TABLE booking_item DROP COLUMN IF EXISTS billing_unit;
      DELETE FROM commission_rule WHERE billing_unit IN ('HOURLY','DAILY','WEEKLY','MONTHLY');
      ALTER TABLE commission_rule DROP COLUMN IF EXISTS billing_unit;
      DROP TABLE IF EXISTS room_price_package;
      ALTER TABLE room_type DROP COLUMN IF EXISTS marketplace_slug;
      DELETE FROM location_categories WHERE slug IN (
        'TRAINING_ROOM','WORKSHOP_SPACE','PHOTO_VIDEO_STUDIO','PODCAST_STUDIO',
        'YOGA_DANCE_STUDIO','RESTAURANT_HOTEL_EVENT_SPACE','SMALL_EVENT_SPACE',
        'CREATIVE_COMMUNITY_SPACE','MEETING_ROOM','COWORKING_SPACE'
      );
      ALTER TABLE location_categories
        DROP COLUMN IF EXISTS is_marketplace,
        DROP COLUMN IF EXISTS marketplace_slug;
    `);
  }
}
