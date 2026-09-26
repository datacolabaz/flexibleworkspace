import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P3 — Event platform slice.
 * Creates three tables:
 *   • events            — the core event record
 *   • event_locations   — links an event to a venue booking (nullable FKs,
 *                         so an event can save before a venue is chosen)
 *   • event_rsvps       — free-registration attendee records
 *
 * All UUIDs default to gen_random_uuid() (available in Postgres ≥13,
 * already used by the rest of this schema). Soft-delete via deleted_at
 * on events follows the same pattern as booking / provider / location.
 */
export class Events1700000000021 implements MigrationInterface {
  name = 'Events1700000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. ENUM types ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE event_format AS ENUM (
        'workshop', 'telim', 'seminar', 'gorusme', 'networking',
        'panel', 'podkast', 'foto_video', 'diger'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE event_visibility AS ENUM ('public', 'private');
    `);
    await queryRunner.query(`
      CREATE TYPE event_status AS ENUM (
        'draft', 'venue_pending', 'published', 'rsvp_open',
        'sold_out', 'completed', 'cancelled', 'archived'
      );
    `);
    await queryRunner.query(`
      CREATE TYPE event_location_status AS ENUM ('pending', 'confirmed', 'cancelled');
    `);
    await queryRunner.query(`
      CREATE TYPE event_rsvp_status AS ENUM ('pending', 'confirmed', 'cancelled', 'waitlisted');
    `);

    // ── 2. events ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE events (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        organizer_id        UUID        NOT NULL REFERENCES app_user(id),
        title               VARCHAR(255) NOT NULL,
        slug                VARCHAR(300) NOT NULL UNIQUE,
        format              event_format NOT NULL DEFAULT 'diger',
        short_description   VARCHAR(500) NOT NULL DEFAULT '',
        description         TEXT        NOT NULL DEFAULT '',
        cover_image         VARCHAR(500),
        language            VARCHAR(10)  NOT NULL DEFAULT 'az',
        capacity            INT,
        visibility          event_visibility NOT NULL DEFAULT 'public',
        status              event_status     NOT NULL DEFAULT 'draft',
        start_at            TIMESTAMPTZ NOT NULL,
        end_at              TIMESTAMPTZ NOT NULL,
        rsvp_deadline       TIMESTAMPTZ,
        doors_open_at       TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at        TIMESTAMPTZ,
        cancelled_at        TIMESTAMPTZ,
        deleted_at          TIMESTAMPTZ
      );
    `);

    // ── 3. event_locations ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE event_locations (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        location_id UUID        REFERENCES location(id),
        booking_id  UUID        REFERENCES booking(id),
        start_at    TIMESTAMPTZ,
        end_at      TIMESTAMPTZ,
        status      event_location_status NOT NULL DEFAULT 'pending',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 4. event_rsvps ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE event_rsvps (
        id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id            UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id             UUID        REFERENCES app_user(id),
        name                VARCHAR(255) NOT NULL,
        email               VARCHAR(255) NOT NULL,
        phone               VARCHAR(50),
        status              event_rsvp_status NOT NULL DEFAULT 'confirmed',
        confirmation_code   VARCHAR(20) NOT NULL UNIQUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // ── 5. Indexes ────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE INDEX idx_events_organizer ON events(organizer_id);`);
    await queryRunner.query(`CREATE INDEX idx_events_status ON events(status);`);
    await queryRunner.query(`CREATE INDEX idx_events_start_at ON events(start_at);`);
    await queryRunner.query(`CREATE INDEX idx_event_locations_event ON event_locations(event_id);`);
    await queryRunner.query(`CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);`);
    await queryRunner.query(`CREATE INDEX idx_event_rsvps_email ON event_rsvps(email);`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS event_rsvps;`);
    await queryRunner.query(`DROP TABLE IF EXISTS event_locations;`);
    await queryRunner.query(`DROP TABLE IF EXISTS events;`);
    await queryRunner.query(`DROP TYPE IF EXISTS event_rsvp_status;`);
    await queryRunner.query(`DROP TYPE IF EXISTS event_location_status;`);
    await queryRunner.query(`DROP TYPE IF EXISTS event_status;`);
    await queryRunner.query(`DROP TYPE IF EXISTS event_visibility;`);
    await queryRunner.query(`DROP TYPE IF EXISTS event_format;`);
  }
}
