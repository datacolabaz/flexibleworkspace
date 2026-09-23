import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { ProviderEntity } from './entities/provider.entity';
import { ProviderVerificationEventEntity } from './entities/provider-verification-event.entity';
import { ProviderDocumentHashEntity } from './entities/provider-document-hash.entity';
import { ProviderStaffEntity } from './entities/provider-staff.entity';
import { UserRoleEntity } from '../auth/entities/user-role.entity';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      ProviderVerificationEventEntity,
      ProviderDocumentHashEntity,
      ProviderStaffEntity,
      UserRoleEntity,
    ]),
    AuditModule,
    StorageModule,
  ],
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService, TypeOrmModule],
})
export class ProvidersModule {}
