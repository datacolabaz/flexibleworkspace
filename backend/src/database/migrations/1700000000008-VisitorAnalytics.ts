import { MigrationInterface, QueryRunner } from 'typeorm';

export class VisitorAnalytics1700000000008 implements MigrationInterface {
  name = 'VisitorAnalytics1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE visitor_event (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(40) NOT NULL,
        path VARCHAR(500) NOT NULL,
        visitor_hash CHAR(64) NOT NULL,
        room_id UUID NULL REFERENCES room(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_visitor_event_created_at ON visitor_event (created_at);
      CREATE INDEX idx_visitor_event_visitor_hash_created_at ON visitor_event (visitor_hash, created_at);
      CREATE INDEX idx_visitor_event_path_created_at ON visitor_event (path, created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS visitor_event');
  }
}
