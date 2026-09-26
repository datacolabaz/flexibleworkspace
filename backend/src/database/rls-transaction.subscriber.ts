import { Injectable, Logger } from '@nestjs/common';
import {
  EventSubscriber,
  EntitySubscriberInterface,
  TransactionStartEvent,
} from 'typeorm';

import { RlsContextService } from './rls-context.service';

/**
 * TypeORM entity subscriber that fires before each transaction starts.
 * Uses `SET LOCAL` so the session variables are scoped to the transaction
 * and automatically revert on commit or rollback — safe with connection
 * pooling (no leakage between requests).
 *
 * The subscriber is wired as a TypeORM subscriber (not as an NestJS service
 * alone) — it must be passed via TypeORM's `subscribers` option OR registered
 * after DataSource init. Here we leverage the @EventSubscriber() decorator
 * and NestJS DI together via the database module.
 *
 * If no RLS context is present (e.g. background tasks, migration runner),
 * the SET LOCAL calls use empty strings, which the RLS policies treat as
 * "no match" — access falls through to publicly-visible rows only.
 */
@Injectable()
@EventSubscriber()
export class RlsTransactionSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(RlsTransactionSubscriber.name);

  constructor(private readonly rlsContext: RlsContextService) {}

  async beforeTransactionStart(event: TransactionStartEvent): Promise<void> {
    const ctx = this.rlsContext.safeContext();
    try {
      await event.queryRunner.query(
        `SELECT set_config('app.current_user_id', $1, true),
                set_config('app.current_provider_id', $2, true),
                set_config('app.current_role', $3, true)`,
        [ctx.userId, ctx.providerId, ctx.role],
      );
    } catch (err) {
      // Non-fatal: log but do not abort the transaction. The RLS policies
      // use `current_setting(..., true)` (missing-ok), so an empty value
      // means "unauthenticated" and the policies behave correctly.
      this.logger.warn(
        `RLS SET LOCAL failed: ${(err as Error).message}`,
      );
    }
  }
}
