import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProvidersService } from './providers.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { VerifyProviderDto } from './dto/verify-provider.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName, ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';
import { ProviderVerificationStatus } from '../../common/constants/provider.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';

@ApiTags('Provider')
@Controller()
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post('providers')
  @ApiOperation({
    summary: 'Register as a provider (self-service, starts PENDING)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProviderDto,
  ) {
    return this.providersService.create(user.userId, dto);
  }

  @Get('providers/me')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'My provider profile' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.providersService.findMine(currentProviderId(user));
  }

  @Get('admin/providers')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_READ)
  @ApiOperation({ summary: 'List/filter providers by verification status' })
  async listForAdmin(
    @Query('verificationStatus')
    verificationStatus?: ProviderVerificationStatus,
  ) {
    return this.providersService.listForAdmin(verificationStatus);
  }

  @Post('admin/providers/:id/verify')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_VERIFY)
  @ApiOperation({
    summary:
      'Approve or reject a provider (24_ADMIN_ARCHITECTURE.md §24.2), reason required',
  })
  async verify(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyProviderDto,
  ) {
    return this.providersService.verify(id, user.userId, dto);
  }

  @Patch('admin/providers/:id/suspend')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PROVIDER_SUSPEND)
  @ApiOperation({
    summary:
      'Suspend or reinstate a VERIFIED provider, reason required (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.5)',
  })
  async setSuspended(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { suspended: boolean; notes?: string },
  ) {
    return this.providersService.setSuspended(
      id,
      user.userId,
      body.suspended,
      body.notes,
    );
  }
}
