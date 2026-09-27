import { Body, Controller, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ReferralLinksService } from './referral-links.service';
import { CreateReferralLinkDto } from './dto/create-referral-link.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { ReferralLinkOwnerType } from '../../common/constants/attribution.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

@ApiTags('Referral links')
@Controller()
export class ReferralLinksController {
  constructor(private readonly referralLinks: ReferralLinksService) {}

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

  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @Post('provider/referral-links')
  @ApiOperation({ summary: 'Create a tracked link for one of my locations' })
  createProviderLink(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReferralLinkDto,
  ) {
    return this.referralLinks.createForProvider(this.requireProviderId(user), dto);
  }

  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @Get('provider/referral-links')
  listProviderLinks(@CurrentUser() user: AuthenticatedUser) {
    return this.referralLinks.listForOwner(
      ReferralLinkOwnerType.PROVIDER,
      this.requireProviderId(user),
    );
  }

  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @Post('provider/referral-links/:id/revoke')
  revokeProviderLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.referralLinks.revoke(
      ReferralLinkOwnerType.PROVIDER,
      this.requireProviderId(user),
      id,
    );
  }

  @Post('organizer/referral-links')
  @ApiOperation({ summary: 'Create a tracked link for one of my events' })
  createOrganizerLink(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReferralLinkDto,
  ) {
    return this.referralLinks.createForOrganizer(user.userId, dto);
  }

  @Get('organizer/referral-links')
  listOrganizerLinks(@CurrentUser() user: AuthenticatedUser) {
    return this.referralLinks.listForOwner(
      ReferralLinkOwnerType.ORGANIZER,
      user.userId,
    );
  }

  @Post('organizer/referral-links/:id/revoke')
  revokeOrganizerLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.referralLinks.revoke(
      ReferralLinkOwnerType.ORGANIZER,
      user.userId,
      id,
    );
  }
}
