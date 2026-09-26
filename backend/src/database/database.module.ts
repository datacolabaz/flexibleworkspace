import { Global, Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RlsContextService } from './rls-context.service';
import { RlsTransactionSubscriber } from './rls-transaction.subscriber';
import { RlsInterceptor } from './rls.interceptor';

/**
 * Global module that wires up RLS context services and registers the
 * TypeORM transaction subscriber with the DataSource.
 *
 * The subscriber cannot be passed via TypeOrmModule.forRootAsync({ subscribers })
 * because it depends on RlsContextService (NestJS DI-managed). Instead, we
 * register it programmatically via DataSource.subscribers in onModuleInit.
 */
@Global()
@Module({
  providers: [RlsContextService, RlsTransactionSubscriber, RlsInterceptor],
  exports: [RlsContextService, RlsTransactionSubscriber, RlsInterceptor],
})
export class DatabaseModule implements OnModuleInit {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rlsSubscriber: RlsTransactionSubscriber,
  ) {}

  onModuleInit(): void {
    // Register the subscriber with TypeORM's DataSource so beforeTransactionStart
    // is called for every transaction opened via this DataSource.
    if (!this.dataSource.subscribers.includes(this.rlsSubscriber)) {
      this.dataSource.subscribers.push(this.rlsSubscriber);
    }
  }
}
