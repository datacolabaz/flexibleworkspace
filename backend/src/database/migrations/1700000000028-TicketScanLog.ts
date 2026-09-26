import { MigrationInterface, QueryRunner } from 'typeorm';

export class TicketScanLog1700000000028 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS ticket_scan_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES event_tickets(id),
        event_id UUID NOT NULL REFERENCES events(id),
        scanner_user_id UUID NOT NULL REFERENCES app_user(id),
        result VARCHAR(30) NOT NULL,
        reason TEXT,
        scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        device_info JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_scan_log_event  ON ticket_scan_log(event_id);
      CREATE INDEX IF NOT EXISTS idx_scan_log_ticket ON ticket_scan_log(ticket_id);
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS ticket_scan_log;`);
  }
}
