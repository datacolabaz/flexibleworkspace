import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RewardRuleEntity } from './entities/reward-rule.entity';
import { ReferralRewardEntity } from './entities/referral-reward.entity';

/** Schema-only scaffold. No reward APIs and no is_active=true rules. */
@Module({
  imports: [TypeOrmModule.forFeature([RewardRuleEntity, ReferralRewardEntity])],
  exports: [TypeOrmModule],
})
export class RewardsModule {}
