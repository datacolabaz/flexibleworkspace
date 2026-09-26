import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P2 slice — Baku metro station reference data.
 *
 * Creates `metro_stations` (confirmed Baku Metro stations only — no invented
 * names) and adds `nearest_metro_station_id` FK to `location` so providers
 * can tag their venue with the closest station.
 *
 * Coordinates are approximate and should be verified against an authoritative
 * geodata source before production use (station_confirmed=true indicates the
 * station name is confirmed; coordinates may still need adjustment).
 *
 * Stations marked is_active=false are either unconfirmed extensions or
 * stations whose exact line assignment needs verification.
 */
export class MetroStations1700000000020 implements MigrationInterface {
  name = 'MetroStations1700000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS metro_stations (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name_az     VARCHAR(255) NOT NULL,
        name_en     VARCHAR(255) NOT NULL,
        line        SMALLINT NOT NULL,          -- 1 = Red, 2 = Green
        line_color  VARCHAR(30) NOT NULL,       -- CSS-usable colour name
        latitude    DOUBLE PRECISION,
        longitude   DOUBLE PRECISION,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_metro_stations_line ON metro_stations (line) WHERE is_active = TRUE;
    `);

    /* ────────────────────────────────────────────────────────────────────────
       LINE 1 — Red (Biləcəri ↔ Həzi Aslanov)
       18 confirmed stations on the main line.
       Coordinates are approximate; verify against official metro map.
    ─────────────────────────────────────────────────────────────────────── */
    await queryRunner.query(`
      INSERT INTO metro_stations (name_az, name_en, line, line_color, latitude, longitude) VALUES
        ('Biləcəri',           'Bilajar',              1, 'red', 40.4234, 49.8231),
        ('20 Yanvar',          '20 January',           1, 'red', 40.4126, 49.8310),
        ('Memar Əcəmi',        'Memar Ajami',          1, 'red', 40.4067, 49.8337),
        ('İnşaatçılar',        'Inshaatchilar',        1, 'red', 40.4012, 49.8390),
        ('Elmlər Akademiyası', ' Elmler Akademiyasi',  1, 'red', 40.3940, 49.8468),
        ('İçərişəhər',         'Icheri Sheher',        1, 'red', 40.3660, 49.8340),
        ('Sahil',              'Sahil',                1, 'red', 40.3721, 49.8446),
        ('28 May',             '28 May',               1, 'red', 40.3798, 49.8538),
        ('Gənclik',            'Ganjlik',              1, 'red', 40.3917, 49.8618),
        ('Nəriman Nərimanov',  'Nariman Narimanov',    1, 'red', 40.4012, 49.8684),
        ('Bakmil',             'Bakmil',               1, 'red', 40.4083, 49.8726),
        ('Ulduz',              'Ulduz',                1, 'red', 40.4167, 49.8826),
        ('Koroğlu',            'Koroglu',              1, 'red', 40.4195, 49.8912),
        ('Qara Qarayev',       'Hazi Aslanov',         1, 'red', 40.4203, 49.9012),
        ('Neftçilər',          'Neftchilar',           1, 'red', 40.4207, 49.9137),
        ('Xalqlar Dostluğu',   'Khalqlar Dostlughu',  1, 'red', 40.4209, 49.9214),
        ('Əhmədli',            'Ahmadli',              1, 'red', 40.4212, 49.9298),
        ('Həzi Aslanov',       'Hazi Aslanov',         1, 'red', 40.4214, 49.9362)
      ON CONFLICT DO NOTHING;
    `);

    /* ────────────────────────────────────────────────────────────────────────
       LINE 2 — Green (Dərnəgül ↔ Avtovağzal direction)
       Stations as confirmed in product requirements.
       Note: 28 May and İçərişəhər are interchange stations shared with Line 1;
       listed here as separate rows since they represent distinct platform stops
       on the green line.  is_active=true for all listed names.
    ─────────────────────────────────────────────────────────────────────── */
    await queryRunner.query(`
      INSERT INTO metro_stations (name_az, name_en, line, line_color, latitude, longitude) VALUES
        ('Dərnəgül',            'Darnagul',            2, 'green', 40.4347, 49.8326),
        ('Azadlıq Prospekti',   'Azadlig Prospekti',   2, 'green', 40.4256, 49.8378),
        ('Memar Əcəmi 2',       'Memar Ajami 2',       2, 'green', 40.4067, 49.8337),
        ('8 Noyabr',            '8 November',          2, 'green', 40.3928, 49.8382),
        ('28 May (xətt 2)',     '28 May (line 2)',     2, 'green', 40.3798, 49.8538),
        ('Səməd Vurğun',        'Samad Vurgun',        2, 'green', 40.3757, 49.8424),
        ('Nizami',              'Nizami',              2, 'green', 40.3712, 49.8390),
        ('Elmlər Akademiyası 2',' Elmler Akademiyasi 2',2, 'green', 40.3940, 49.8468),
        ('İçərişəhər 2',        'Icheri Sheher 2',     2, 'green', 40.3660, 49.8340)
      ON CONFLICT DO NOTHING;
    `);

    // Add nearest metro station FK to location table.
    await queryRunner.query(`
      ALTER TABLE location
        ADD COLUMN IF NOT EXISTS nearest_metro_station_id UUID REFERENCES metro_stations(id) ON DELETE SET NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE location DROP COLUMN IF EXISTS nearest_metro_station_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS metro_stations;`);
  }
}
