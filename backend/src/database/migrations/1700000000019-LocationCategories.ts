import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 slice — Location categories as a seeded reference table.
 *
 * Creates `location_categories` (id, slug, name_az, name_en, sort_order, is_active)
 * and seeds the 13 Azerbaijani provider category slugs specified in the
 * product requirements. Also adds a `categories JSONB` column to `provider`
 * to support multi-category selection while preserving the existing
 * `category VARCHAR(100)` column for backward compatibility.
 */
export class LocationCategories1700000000019 implements MigrationInterface {
  name = 'LocationCategories1700000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS location_categories (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        VARCHAR(100) NOT NULL UNIQUE,
        name_az     VARCHAR(255) NOT NULL,
        name_en     VARCHAR(255) NOT NULL,
        sort_order  INT NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      INSERT INTO location_categories (slug, name_az, name_en, sort_order) VALUES
        ('studiya',            'Studiya',                   'Studio',                          1),
        ('telim-otagi',        'Təlim otağı',               'Training Room',                   2),
        ('workshop-otagi',     'Workshop otağı',            'Workshop Space',                  3),
        ('coworking',          'Coworking',                 'Coworking',                       4),
        ('ofis-sahesi',        'Ofis sahəsi',               'Office Space (hot/flex desk)',     5),
        ('ferdi-ofis',         'Fərdi ofis',                'Private Office',                  6),
        ('icas-otagi',         'İclas otağı',               'Meeting Room',                    7),
        ('konfrans-otagi',     'Konfrans otağı',            'Conference Room',                 8),
        ('seminar-otagi',      'Seminar otağı',             'Seminar Room',                    9),
        ('sinif-otagi',        'Sinif otağı',               'Classroom',                       10),
        ('podkast-studiyasi',  'Podkast studiyası',         'Podcast Studio',                  11),
        ('foto-video-studiya', 'Foto və video studiyası',   'Photo & Video Studio',            12),
        ('tdbir-mkani',        'Tədbir məkanı',             'Event Space',                     13),
        ('emalatxana',         'Emalatxana sahəsi',         'Workshop Area',                   14),
        ('mutfeq-yeyi',        'Mətbəx / yeməkxana',        'Kitchen / Canteen',               15),
        ('spor-zal',           'İdman zalı',                'Gym / Sports Hall',               16),
        ('ses-studiyasi',      'Səs studiyası',             'Sound Studio',                    17),
        ('rehearsal-space',    'Məşq sahəsi',               'Rehearsal Space',                 18),
        ('outdoor-space',      'Açıq sahə',                 'Outdoor Space',                   19),
        ('kafe-restoran',      'Kafe / restoran',           'Cafe / Restaurant',               20)
      ON CONFLICT (slug) DO NOTHING;
    `);

    // Add multi-category support to provider; keep old category column intact.
    await queryRunner.query(`
      ALTER TABLE provider
        ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE provider DROP COLUMN IF EXISTS categories;`);
    await queryRunner.query(`DROP TABLE IF EXISTS location_categories;`);
  }
}
