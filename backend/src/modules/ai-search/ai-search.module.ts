import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { AiSearchController } from './ai-search.controller';
import { AiSearchOrchestrator } from './ai-search.orchestrator';
import { AiSearchService } from './ai-search.service';
import { TaxonomyMapper } from './taxonomy.mapper';

@Module({
  imports: [SearchModule],
  controllers: [AiSearchController],
  providers: [AiSearchService, AiSearchOrchestrator, TaxonomyMapper],
})
export class AiSearchModule {}
