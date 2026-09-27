import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { ProviderAnalyticsController } from './provider-analytics.controller';
import { OrganizerAnalyticsController } from './organizer-analytics.controller';
import { AnalyticsService } from './analytics.service';
import { VisitorEventEntity } from './entities/visitor-event.entity';
import { AnalyticsEventEntity } from './entities/analytics-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VisitorEventEntity, AnalyticsEventEntity])],
  controllers: [AnalyticsController, ProviderAnalyticsController, OrganizerAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
