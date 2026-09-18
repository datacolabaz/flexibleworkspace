/**
 * Mirrors the `role_name` PostgreSQL enum in 28_DATABASE_DDL.sql, as
 * extended by 34_ADMIN_AUDIT_DDL.sql / ADR-011
 * (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.2): the original
 * PLATFORM_ADMIN/SUPPORT_OPS two-role model was renamed in place
 * (metadata-only, no data rewrite) to SUPER_ADMIN/SUPPORT_ADMIN and joined
 * by four more admin roles. If this ever drifts from the DB enum,
 * migrations are the source of truth — update this file to match, never
 * the other way around.
 */
export enum RoleName {
  CUSTOMER = 'CUSTOMER',
  PROVIDER_OWNER = 'PROVIDER_OWNER',
  PROVIDER_STAFF = 'PROVIDER_STAFF',
  SUPER_ADMIN = 'SUPER_ADMIN',
  OPERATIONS_ADMIN = 'OPERATIONS_ADMIN',
  FINANCE_ADMIN = 'FINANCE_ADMIN',
  CONTENT_ADMIN = 'CONTENT_ADMIN',
  SUPPORT_ADMIN = 'SUPPORT_ADMIN',
  MODERATION_ADMIN = 'MODERATION_ADMIN',
}

/** The six roles considered "internal admin staff" — used by generic admin-surface guards. */
export const ADMIN_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.OPERATIONS_ADMIN,
  RoleName.FINANCE_ADMIN,
  RoleName.CONTENT_ADMIN,
  RoleName.SUPPORT_ADMIN,
  RoleName.MODERATION_ADMIN,
];
