import { AuthenticatedUser } from '../guards/jwt-auth.guard';
import { RoleName } from '../constants/roles.enum';

/**
 * Resolves the provider a PROVIDER_OWNER/PROVIDER_STAFF caller is scoped to,
 * from their JWT role claims (11_API_CONTRACTS.md §11.4). Returns null for a
 * caller with no such role — callers must handle that as "not a provider",
 * never assume a providerId exists.
 */
export function currentProviderId(
  user: AuthenticatedUser | undefined,
): string | null {
  const role = user?.roles?.find(
    (r) =>
      (r.role === RoleName.PROVIDER_OWNER ||
        r.role === RoleName.PROVIDER_STAFF) &&
      r.providerId,
  );
  return role?.providerId ?? null;
}
