import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlanUpgradeRequestsProviderController } from './plan-upgrade-requests-provider.controller';
import { PlanUpgradeRequestsAdminController } from './plan-upgrade-requests-admin.controller';
import { PlanUpgradeRequestsService } from './plan-upgrade-requests.service';
import { PlanUpgradeRequestEntity } from './entities/plan-upgrade-request.entity';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanUpgradeRequestEntity]),
    ProvidersModule,
  ],
  controllers: [
    PlanUpgradeRequestsProviderController,
    PlanUpgradeRequestsAdminController,
  ],
  providers: [PlanUpgradeRequestsService],
  exports: [PlanUpgradeRequestsService],
})
export class PlanUpgradeRequestsModule {}
