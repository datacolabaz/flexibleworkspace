import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Leads')
@Controller('spaces')
export class LeadsPublicController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Post(':roomId/leads')
  @ApiOperation({
    summary:
      'Express interest in a room without booking/paying (Sprint 3 — no live payment gateway yet)',
  })
  async create(@Param('roomId') roomId: string, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(roomId, dto);
  }
}
