import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Event ticket sales + QR check-in system.
 * Creates two tables:
 *   • event_ticket_types — ticket tiers per event (Free, Standard, VIP, …)
 *   • event_tickets      — individual purchased tickets with QR token
 *
 * Also adds two nullable columns to the events table so tickets can be
 * toggled on/off per event without requiring every existing event to be
 * touched.
 */
export class EventTickets1700000000027 implements MigrationInterface {
  name = 'EventTickets1700000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. event_ticket_types ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_ticket_types (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id        UUID         NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name            VARCHAR(100) NOT NULL,
        description     TEXT,
        price           DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency        VARCHAR(3)   NOT NULL DEFAULT 'AZN',
        quantity_total  INTEGER,
        quantity_sold   INTEGER      NOT NULL DEFAULT 0,
        is_active       BOOLEAN      NOT NULL DEFAULT true,
        sale_starts_at  TIMESTAMPTZ,
        sale_ends_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── 2. event_tickets ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_tickets (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_type_id  UUID         NOT NULL REFERENCES event_ticket_types(id),
        event_id        UUID         NOT NULL REFERENCES events(id),
        user_id         UUID         NOT NULL REFERENCES app_user(id),
        order_id        VARCHAR(100),
        status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
        qr_code         VARCHAR(255) UNIQUE,
        checked_in_at   TIMESTAMPTZ,
        checked_in_by   UUID         REFERENCES app_user(id),
        amount_paid     DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency        VARCHAR(3)   NOT NULL DEFAULT 'AZN',
        buyer_name      VARCHAR(200),
        buyer_email     VARCHAR(255),
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── 3. Indexes ────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_event_tickets_event_id ON event_tickets(event_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_event_tickets_user_id ON event_tickets(user_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_event_tickets_qr_code ON event_tickets(qr_code);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_event_ticket_types_event_id ON event_ticket_types(event_id);`,
    );

    // ── 4. Add columns to events ──────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS tickets_enabled BOOLEAN NOT NULL DEFAULT false;`,
    );
    await queryRunner.query(
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS max_attendees INTEGER;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE events DROP COLUMN IF EXISTS max_attendees;`);
    await queryRunner.query(`ALTER TABLE events DROP COLUMN IF EXISTS tickets_enabled;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_event_ticket_types_event_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_event_tickets_qr_code;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_event_tickets_user_id;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_event_tickets_event_id;`);
    await queryRunner.query(`DROP TABLE IF EXISTS event_tickets;`);
    await queryRunner.query(`DROP TABLE IF EXISTS event_ticket_types;`);
  }
}
