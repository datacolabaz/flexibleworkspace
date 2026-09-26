import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationCategoryEntity } from '../locations/entities/location-category.entity';
import { MetroStationEntity } from '../locations/entities/metro-station.entity';
import { SearchModule } from '../search/search.module';
import { AiSearchController } from './ai-search.controller';
import { AiSearchOrchestrator } from './ai-search.orchestrator';
import { AiSearchService } from './ai-search.service';
import { TaxonomyMapper } from './taxonomy.mapper';

@Module({
  imports: [
    SearchModule,
    TypeOrmModule.forFeature([MetroStationEntity, LocationCategoryEntity]),
  ],
  controllers: [AiSearchController],
  providers: [AiSearchService, AiSearchOrchestrator, TaxonomyMapper],
})
export class AiSearchModule {}
