import { Module } from '@nestjs/common';
import { AiSearchController } from './ai-search.controller';
import { AiSearchService } from './ai-search.service';

@Module({
  controllers: [AiSearchController],
  providers: [AiSearchService],
})
export class AiSearchModule {}
