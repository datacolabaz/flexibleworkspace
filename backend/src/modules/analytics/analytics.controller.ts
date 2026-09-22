import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { AnalyticsService } from './analytics.service';

class PageviewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  path!: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Public()
  @Post('pageview')
  recordPageview(@Req() request: Request, @Body() dto: PageviewDto) {
    return this.analyticsService.recordPageview({
      path: dto.path,
      roomId: dto.roomId,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? '',
    });
  }
}
