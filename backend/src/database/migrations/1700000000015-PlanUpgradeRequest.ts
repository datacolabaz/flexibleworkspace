import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Provider Listing Media Specification's FREE/PRO plan comparison
 * (5 vs 10 photos, video, "more visibility", analytics) is now visible
 * to providers in their own panel, but there is still no live payment
 * gateway (the owner's standing "no payment integration for initial
 * launch" decision — same reasoning as `lead` in 1700000000011-Leads).
 * `plan_upgrade_request` is the same "supply first, high-touch ops"
 * pattern `lead` already uses: a provider expresses interest in
 * upgrading, an admin follows up and grants the plan manually via
 * `PATCH admin/providers/:id/plan` (which also works standalone, with
 * no request attached, for a downgrade or an unprompted grant).
 */
export class PlanUpgradeRequest1700000000015 implements MigrationInterface {
  name = 'PlanUpgradeRequest1700000000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE plan_upgrade_request_status AS ENUM ('PENDING', 'RESOLVED');

      CREATE TABLE plan_upgrade_request (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider_id UUID NOT NULL REFERENCES provider(id),
        note TEXT,
        status plan_upgrade_request_status NOT NULL DEFAULT 'PENDING',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        resolved_by_user_id UUID REFERENCES app_user(id)
      );

      CREATE INDEX idx_plan_upgrade_request_provider_id ON plan_upgrade_request(provider_id);
      CREATE INDEX idx_plan_upgrade_request_status ON plan_upgrade_request(status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS plan_upgrade_request;
      DROP TYPE IF EXISTS plan_upgrade_request_status;
    `);
  }
}
