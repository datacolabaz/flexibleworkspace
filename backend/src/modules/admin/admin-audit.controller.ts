import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuditLogService } from '../audit/audit-log.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

/** 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §19 "Admin Activity Center" — filterable browsing of the append-only audit log. */
@ApiTags('Admin')
@Controller('admin/audit-log')
@Roles(...ADMIN_ROLES)
@RequirePermission(AdminPermission.AUDIT_READ)
export class AdminAuditController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({
    summary:
      'Filterable audit log listing (entityType, entityId, actorUserId, action)',
  })
  async list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
  ) {
    return this.auditLogService.list({
      entityType,
      entityId,
      actorUserId,
      action,
    });
  }
}
