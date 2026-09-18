import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminListingsService } from './admin-listings.service';
import { CorrectRoomDto } from './dto/correct-room.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

/** 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §5/§6/§7 — cross-provider listing correction with audit trail + revert. */
@ApiTags('Admin')
@Controller('admin/rooms')
@Roles(...ADMIN_ROLES)
@RequirePermission(AdminPermission.LISTING_UPDATE)
export class AdminListingsController {
  constructor(private readonly adminListingsService: AdminListingsService) {}

  @Patch(':id')
  @ApiOperation({
    summary:
      "Correct a room's fields regardless of owning provider (reason required, fully audited)",
  })
  async correct(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CorrectRoomDto,
  ) {
    return this.adminListingsService.correctRoom(id, user.userId, dto);
  }

  @Post(':id/revert/:auditLogId')
  @ApiOperation({
    summary:
      'Undo one prior correction by re-applying its prior values as a new, audited change (§33.7)',
  })
  async revert(
    @Param('id') id: string,
    @Param('auditLogId') auditLogId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminListingsService.revertRoomCorrection(
      id,
      auditLogId,
      user.userId,
    );
  }
}
