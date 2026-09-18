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

import { AdminUsersService } from './admin-users.service';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

/** 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §2 User Management. */
@ApiTags('Admin')
@Controller('admin/users')
@Roles(...ADMIN_ROLES)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequirePermission(AdminPermission.USER_READ)
  @ApiOperation({
    summary: 'Search/list users by email, phone, or display name',
  })
  async list(@Query('q') q?: string) {
    return this.adminUsersService.list(q);
  }

  @Get(':id')
  @RequirePermission(AdminPermission.USER_READ)
  @ApiOperation({ summary: 'A single user, with role assignments' })
  async findOne(@Param('id') id: string) {
    return this.adminUsersService.findById(id);
  }

  @Patch(':id')
  @RequirePermission(AdminPermission.USER_UPDATE)
  @ApiOperation({
    summary:
      "Correct a user's display fields (narrow allowlist, reason required, audited)",
  })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.adminUsersService.update(id, user.userId, dto);
  }

  @Post(':id/suspend')
  @RequirePermission(AdminPermission.USER_SUSPEND)
  @ApiOperation({
    summary: 'Suspend or reinstate a user account, reason required',
  })
  async suspend(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SuspendUserDto,
  ) {
    return this.adminUsersService.setSuspended(
      id,
      user.userId,
      dto.suspended,
      dto.reason,
    );
  }
}
