import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AccountService, ProfileResponse } from './account.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';

/**
 * Self-service profile. Not @Public() — the global JwtAuthGuard (see
 * AppModule) gates every route here on a real session, same as
 * FavoritesController/BookingsController's `/account/bookings`.
 */
@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get('me')
  @ApiOperation({ summary: "Current user's own profile" })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ProfileResponse> {
    return this.accountService.getProfile(user.userId);
  }

  @Patch('me')
  @ApiOperation({
    summary:
      "Update current user's own profile (displayName/locale only — see UpdateProfileDto)",
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    return this.accountService.updateProfile(user.userId, dto);
  }
}
