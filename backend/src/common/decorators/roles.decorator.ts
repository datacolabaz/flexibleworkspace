import { SetMetadata } from '@nestjs/common';
import { RoleName } from '../constants/roles.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to callers holding at least one of the given roles.
 * Combined with RolesGuard. Ownership checks (a provider can only touch
 * THEIR OWN provider_id) are a separate, additional layer — see
 * ProviderScopeGuard — because role membership alone is not sufficient
 * authorization for provider-scoped resources (11_API_CONTRACTS.md §11.4).
 */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
