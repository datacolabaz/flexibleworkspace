import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { ProviderEntity } from './entities/provider.entity';
import { ProviderVerificationEventEntity } from './entities/provider-verification-event.entity';
import { ProviderStaffEntity } from './entities/provider-staff.entity';
import { UserRoleEntity } from '../auth/entities/user-role.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      ProviderVerificationEventEntity,
      ProviderStaffEntity,
      UserRoleEntity,
    ]),
    AuditModule,
  ],
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService, TypeOrmModule],
})
export class ProvidersModule {}
