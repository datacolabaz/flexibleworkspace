import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReferralLinkEntity } from './entities/referral-link.entity';
import { ReferralLinkClickEntity } from './entities/referral-link-click.entity';
import { ReferralLinksService } from './referral-links.service';
import { ReferralLinksController } from './referral-links.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralLinkEntity, ReferralLinkClickEntity]),
  ],
  controllers: [ReferralLinksController],
  providers: [ReferralLinksService],
  exports: [ReferralLinksService, TypeOrmModule],
})
export class ReferralsModule {}
