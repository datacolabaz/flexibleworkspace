import { of } from 'rxjs';

import { RlsInterceptor } from './rls.interceptor';
import { RlsContextService } from './rls-context.service';
import { RoleName } from '../common/constants/roles.enum';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';

function httpContext(user?: AuthenticatedUser) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('RlsInterceptor', () => {
  const rlsContext = new RlsContextService();
  const interceptor = new RlsInterceptor(rlsContext);

  it('stores empty context for unauthenticated requests', (done) => {
    interceptor
      .intercept(httpContext(undefined), {
        handle: () =>
          of(
            (() => {
              expect(rlsContext.getContext()).toEqual({
                userId: '',
                providerId: '',
                role: '',
              });
              return 'ok';
            })(),
          ),
      } as any)
      .subscribe(() => done());
  });

  it('prefers admin role over provider role', (done) => {
    const user: AuthenticatedUser = {
      userId: 'u1',
      email: null,
      phone: null,
      roles: [
        { role: RoleName.PROVIDER_OWNER, providerId: 'p1' },
        { role: RoleName.FINANCE_ADMIN, providerId: null },
      ],
    };
    interceptor
      .intercept(httpContext(user), {
        handle: () =>
          of(
            (() => {
              const ctx = rlsContext.getContext();
              expect(ctx?.userId).toBe('u1');
              expect(ctx?.role).toBe(RoleName.FINANCE_ADMIN);
              expect(ctx?.providerId).toBe('p1');
              return 'ok';
            })(),
          ),
      } as any)
      .subscribe(() => done());
  });

  it('resolves provider id from PROVIDER_OWNER claim', (done) => {
    const user: AuthenticatedUser = {
      userId: 'u2',
      email: null,
      phone: null,
      roles: [{ role: RoleName.PROVIDER_OWNER, providerId: 'prov-9' }],
    };
    interceptor
      .intercept(httpContext(user), {
        handle: () =>
          of(
            (() => {
              const ctx = rlsContext.getContext();
              expect(ctx?.providerId).toBe('prov-9');
              expect(ctx?.role).toBe(RoleName.PROVIDER_OWNER);
              return 'ok';
            })(),
          ),
      } as any)
      .subscribe(() => done());
  });
});
