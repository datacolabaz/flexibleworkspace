import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { QueryRunner } from 'typeorm';

export interface RlsContext {
  userId: string;
  providerId: string;
  role: string;
}

/**
 * Holds per-request RLS session variables using Node's AsyncLocalStorage.
 * Populated by RlsInterceptor after JwtAuthGuard attaches req.user.
 * Consumed by RlsTransactionSubscriber to set `SET LOCAL app.*` variables
 * at the start of each TypeORM transaction.
 */
@Injectable()
export class RlsContextService {
  private readonly storage = new AsyncLocalStorage<RlsContext>();

  run<T>(ctx: RlsContext, fn: () => T): T {
    return this.storage.run(ctx, fn);
  }

  getContext(): RlsContext | undefined {
    return this.storage.getStore();
  }

  /** Convenience: returns a safe empty context (no-op RLS) when called outside a request. */
  safeContext(): RlsContext {
    return this.storage.getStore() ?? { userId: '', providerId: '', role: '' };
  }

  /**
   * Re-apply `SET LOCAL app.*` on an already-open transaction. Needed when
   * identity is resolved *after* `startTransaction()` (guest checkout
   * provisions a user inside POST /bookings; the interceptor had no JWT).
   */
  async applyToQueryRunner(
    queryRunner: QueryRunner,
    patch: Partial<RlsContext>,
  ): Promise<void> {
    const current = this.safeContext();
    const merged: RlsContext = {
      userId: patch.userId ?? current.userId,
      providerId: patch.providerId ?? current.providerId,
      role: patch.role ?? current.role,
    };
    await queryRunner.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_provider_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [merged.userId, merged.providerId, merged.role],
    );
  }
}
