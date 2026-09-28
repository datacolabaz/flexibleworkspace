import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Category-scoped premium ranking — admin-only, offline/manual payment
 * (product decision: no online subscription/auction/bidding/automatic
 * ranking at this stage; the provider contacts Spotva via WhatsApp/Vox
 * and pays offline, an admin then flips this on). Deliberately separate
 * from `is_featured` (1700000000012-RoomFeatured.ts) — that flag is a
 * single global on/off toggle feeding only the homepage's featured pool,
 * with no category/priority/expiry and no public consumers touched here.
 *
 * No separate "premium category" column: a room already belongs to
 * exactly one category via `room_type_id`, so premium is implicitly
 * scoped to that — reusing the existing relation rather than duplicating
 * it (per the explicit "don't create a duplicate field" instruction).
 *
 * `premium_priority`: lower = ranked higher among simultaneously-active
 * premium rooms in the same category; NULL sorts after any room with an
 * explicit priority (see SearchService.premiumActiveExpr()/ordering).
 * `premium_starts_at`/`premium_ends_at`: optional active window; NULL on
 * either side means "no bound" on that side. `premium_internal_note`:
 * admin-only context (e.g. "paid via WhatsApp, invoice #123") — read by
 * the admin panel only, never returned by any public endpoint.
 */
export class RoomPremium1700000000039 implements MigrationInterface {
  name = 'RoomPremium1700000000039';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE room
        ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN premium_priority INT,
        ADD COLUMN premium_starts_at TIMESTAMPTZ,
        ADD COLUMN premium_ends_at TIMESTAMPTZ,
        ADD COLUMN premium_internal_note TEXT;

      CREATE INDEX idx_room_premium_active ON room (room_type_id, premium_priority)
        WHERE deleted_at IS NULL AND status = 'ACTIVE' AND is_premium = TRUE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_room_premium_active;
      ALTER TABLE room
        DROP COLUMN IF EXISTS premium_internal_note,
        DROP COLUMN IF EXISTS premium_ends_at,
        DROP COLUMN IF EXISTS premium_starts_at,
        DROP COLUMN IF EXISTS premium_priority,
        DROP COLUMN IF EXISTS is_premium;
    `);
  }
}
