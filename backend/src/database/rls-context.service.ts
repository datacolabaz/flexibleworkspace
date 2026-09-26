import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

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
}
