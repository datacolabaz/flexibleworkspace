import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { AiSearchOrchestrator } from './ai-search.orchestrator';
import { AiSearchService } from './ai-search.service';

class InterpretSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsIn(['az', 'ru', 'en'])
  locale?: 'az' | 'ru' | 'en';
}

@ApiTags('AI Search')
@Controller('ai/search')
export class AiSearchController {
  constructor(
    private readonly aiSearchService: AiSearchService,
    private readonly aiSearchOrchestrator: AiSearchOrchestrator,
  ) {}

  @Public()
  @Post('interpret')
  @ApiOperation({
    summary: 'Convert a natural-language request into existing search filters',
  })
  interpret(@Body() dto: InterpretSearchDto) {
    return this.aiSearchService.interpret(dto.query, dto.locale ?? 'az');
  }

  @Public()
  @Post()
  @ApiOperation({
    summary:
      'Convert a natural-language request and search real available spaces',
  })
  search(@Body() dto: InterpretSearchDto) {
    return this.aiSearchOrchestrator.search(dto.query, dto.locale ?? 'az');
  }
}
