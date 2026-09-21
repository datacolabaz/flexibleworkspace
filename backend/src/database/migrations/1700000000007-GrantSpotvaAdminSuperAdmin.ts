import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grants the platform owner account full admin access.
 *
 * The account may already have a narrower admin role (for example
 * OPERATIONS_ADMIN). We keep that role for audit/history and add SUPER_ADMIN
 * only when it is missing. The migration is idempotent so it is safe to run
 * during a redeploy.
 */
export class GrantSpotvaAdminSuperAdmin1700000000007 implements MigrationInterface {
  name = 'GrantSpotvaAdminSuperAdmin1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO user_role (user_id, role, provider_id)
      SELECT id, 'SUPER_ADMIN'::role_name, NULL
      FROM app_user
      WHERE LOWER(email) = 'admin@spotva.co'
        AND deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM user_role existing_role
          WHERE existing_role.user_id = app_user.id
            AND existing_role.role = 'SUPER_ADMIN'::role_name
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM user_role
      WHERE role = 'SUPER_ADMIN'::role_name
        AND user_id IN (
          SELECT id FROM app_user WHERE LOWER(email) = 'admin@spotva.co'
        );
    `);
  }
}
