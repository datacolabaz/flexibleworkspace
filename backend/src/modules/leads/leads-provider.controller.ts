import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { LeadsService } from './leads.service';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

@ApiTags('Provider')
@Controller('provider/leads')
@Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
export class LeadsProviderController {
  constructor(private readonly leadsService: LeadsService) {}

  private requireProviderId(user: AuthenticatedUser): string {
    const providerId = currentProviderId(user);
    if (!providerId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    return providerId;
  }

  @Get()
  @ApiOperation({
    summary: 'My leads (customers who expressed interest, most recent first)',
  })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.listForProvider(this.requireProviderId(user));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mark a lead as contacted/converted/closed' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leadsService.updateStatus(
      id,
      this.requireProviderId(user),
      user.userId,
      dto.status,
    );
  }
}
