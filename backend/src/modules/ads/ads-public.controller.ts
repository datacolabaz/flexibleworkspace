import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AdsService } from './ads.service';
import { RecordAdEventDto } from './dto/ads.dto';

@ApiTags('Ads')
@Controller('ads')
export class AdsPublicController {
  constructor(private readonly adsService: AdsService) {}

  @Public()
  @Get('slots/:placementKey')
  @ApiOperation({ summary: 'Active creatives for one reusable ad slot' })
  getSlot(@Param('placementKey') placementKey: string) {
    return this.adsService.getPublicSlot(placementKey);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('campaigns/:id/events')
  @ApiOperation({ summary: 'Record a visible impression or a click' })
  recordEvent(@Param('id') id: string, @Body() dto: RecordAdEventDto) {
    return this.adsService.recordEvent(id, dto);
  }
}
