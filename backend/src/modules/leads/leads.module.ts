import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LeadsPublicController } from './leads-public.controller';
import { LeadsProviderController } from './leads-provider.controller';
import { LeadsService } from './leads.service';
import { LeadEntity } from './entities/lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LeadEntity])],
  controllers: [LeadsPublicController, LeadsProviderController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
