import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminTaxonomyService } from './admin-taxonomy.service';
import {
  CreateAmenityDto,
  CreateRoomTypeDto,
  UpdateAmenityDto,
  UpdateRoomTypeDto,
} from './dto/taxonomy.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §12 Taxonomy/Master Data
 * Management — room_type + amenity, admin-editable without a deploy.
 *
 * The approved permission matrix (§33.4) only defines `taxonomy.update`,
 * not a separate read permission (unlike the listing.read/listing.update
 * pair elsewhere) — reference data (room categories, amenities) isn't
 * sensitive, so read access here is left at "any admin role" rather than
 * inventing a new granular permission for it; only the mutating routes are
 * gated behind taxonomy.update (CONTENT_ADMIN/SUPER_ADMIN only).
 */
@ApiTags('Admin')
@Controller('admin/taxonomy')
@Roles(...ADMIN_ROLES)
export class AdminTaxonomyController {
  constructor(private readonly adminTaxonomyService: AdminTaxonomyService) {}

  @Get('room-types')
  async listRoomTypes() {
    return this.adminTaxonomyService.listRoomTypes();
  }

  @Post('room-types')
  @RequirePermission(AdminPermission.TAXONOMY_UPDATE)
  @ApiOperation({
    summary:
      'Add a room type/category (no deploy needed, §12\'s "Podcast Studio" example)',
  })
  async createRoomType(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomTypeDto,
  ) {
    return this.adminTaxonomyService.createRoomType(user.userId, dto);
  }

  @Patch('room-types/:id')
  @RequirePermission(AdminPermission.TAXONOMY_UPDATE)
  async updateRoomType(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    return this.adminTaxonomyService.updateRoomType(id, user.userId, dto);
  }

  @Get('amenities')
  async listAmenities() {
    return this.adminTaxonomyService.listAmenities();
  }

  @Post('amenities')
  @RequirePermission(AdminPermission.TAXONOMY_UPDATE)
  async createAmenity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAmenityDto,
  ) {
    return this.adminTaxonomyService.createAmenity(user.userId, dto);
  }

  @Patch('amenities/:id')
  @RequirePermission(AdminPermission.TAXONOMY_UPDATE)
  async updateAmenity(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAmenityDto,
  ) {
    return this.adminTaxonomyService.updateAmenity(id, user.userId, dto);
  }
}
