import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

import { RlsContextService } from './rls-context.service';
import { AuthenticatedUser } from '../common/guards/jwt-auth.guard';
import { RoleName } from '../common/constants/roles.enum';

/**
 * Global interceptor that runs AFTER JwtAuthGuard (guards run before
 * interceptors in NestJS). Reads the authenticated user from req.user and
 * stores the RLS context in AsyncLocalStorage so RlsTransactionSubscriber
 * can inject `SET LOCAL app.*` variables at the start of each TypeORM
 * transaction.
 *
 * Anonymous requests (req.user is undefined — i.e. @Public() routes or
 * unauthenticated callers) get an empty context so the SET LOCAL calls
 * set empty strings; the RLS policies treat an empty string as "no match",
 * which effectively restricts access to publicly-visible rows only.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly rlsContext: RlsContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const user: AuthenticatedUser | undefined = request.user;

    const userId = user?.userId ?? '';
    const role = this.resolveTopRole(user);
    const providerId = this.resolveProviderId(user);

    return new Observable((observer) => {
      this.rlsContext.run({ userId, providerId, role }, () => {
        next.handle().subscribe({
          next: (value) => observer.next(value),
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        });
      });
    });
  }

  private resolveTopRole(user: AuthenticatedUser | undefined): string {
    if (!user) return '';
    // Admin roles take precedence; then provider; then customer.
    const adminRoles: string[] = [
      RoleName.SUPER_ADMIN,
      RoleName.OPERATIONS_ADMIN,
      RoleName.FINANCE_ADMIN,
      RoleName.SUPPORT_ADMIN,
      RoleName.CONTENT_ADMIN,
      RoleName.MODERATION_ADMIN,
    ];
    const found = user.roles.find((r) => adminRoles.includes(r.role));
    if (found) return found.role;
    const providerRole = user.roles.find(
      (r) =>
        r.role === RoleName.PROVIDER_OWNER || r.role === RoleName.PROVIDER_STAFF,
    );
    if (providerRole) return providerRole.role;
    return user.roles[0]?.role ?? '';
  }

  private resolveProviderId(user: AuthenticatedUser | undefined): string {
    if (!user) return '';
    const role = user.roles.find(
      (r) =>
        (r.role === RoleName.PROVIDER_OWNER ||
          r.role === RoleName.PROVIDER_STAFF) &&
        r.providerId,
    );
    return role?.providerId ?? '';
  }
}
