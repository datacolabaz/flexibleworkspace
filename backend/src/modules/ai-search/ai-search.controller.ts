import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
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

class VoiceParseDto {
  @IsString()
  @MaxLength(500)
  transcript!: string;
}

@ApiTags('AI Search')
@Controller('ai')
export class AiSearchController {
  constructor(
    private readonly aiSearchService: AiSearchService,
    private readonly aiSearchOrchestrator: AiSearchOrchestrator,
  ) {}

  @Public()
  @Post('search/interpret')
  @ApiOperation({
    summary: 'Convert a natural-language request into existing search filters',
  })
  interpret(@Body() dto: InterpretSearchDto) {
    return this.aiSearchService.interpret(dto.query, dto.locale ?? 'az');
  }

  @Public()
  @Post('search')
  @ApiOperation({
    summary:
      'Convert a natural-language request and search real available spaces',
  })
  search(@Body() dto: InterpretSearchDto) {
    return this.aiSearchOrchestrator.search(dto.query, dto.locale ?? 'az');
  }

  @Public()
  @Post('voice-parse')
  @ApiOperation({
    summary:
      'Parse an Azerbaijani voice transcript into structured search filters using AI + DB reference data',
  })
  voiceParse(@Body() dto: VoiceParseDto) {
    return this.aiSearchService.voiceParse(dto.transcript);
  }

  @Public()
  @Post('voice-transcribe')
  @UseInterceptors(FileInterceptor('audio'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Transcribe an audio file via OpenAI Whisper (Azerbaijani)',
  })
  async voiceTranscribe(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ transcript: string; error?: string }> {
    if (!file?.buffer) {
      return { transcript: '', error: 'no_audio_file' };
    }
    const transcript = await this.aiSearchService.voiceTranscribe(
      file.buffer,
      file.mimetype || 'audio/webm',
      file.originalname || 'voice.webm',
    );
    if (!transcript) {
      return { transcript: '', error: 'transcription_failed' };
    }
    return { transcript };
  }
}
