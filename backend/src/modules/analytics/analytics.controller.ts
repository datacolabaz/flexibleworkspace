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
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AnalyticsService } from './analytics.service';
import { RecordAnalyticsEventDto } from './dto/record-analytics-event.dto';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { currentProviderId } from '../../common/utils/current-provider.util';

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

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('event')
  recordEvent(@Req() request: Request, @Body() dto: RecordAnalyticsEventDto) {
    const user = request.user as AuthenticatedUser | undefined;
    return this.analyticsService.recordProductEvent({
      eventName: dto.event,
      props: dto.props,
      clientTs: dto.ts,
      clientEventId: dto.eventId,
      jwtUserId: user?.userId ?? null,
      jwtProviderId: user ? currentProviderId(user) : null,
    });
  }
}
