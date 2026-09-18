import { SetMetadata } from '@nestjs/common';
import { AdminPermission } from '../constants/admin-permission.enum';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Layered on top of @Roles() (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.2):
 * @Roles() gets the caller into the admin surface at all, @RequirePermission()
 * checks the specific module.action the request needs against the
 * code-level ROLE_PERMISSIONS matrix (ADR-011). A route can carry either or
 * both; PermissionGuard is a no-op when this metadata isn't present.
 */
export const RequirePermission = (permission: AdminPermission) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
