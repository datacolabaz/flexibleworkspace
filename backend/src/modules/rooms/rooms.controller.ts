import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RoomsService } from './rooms.service';
import { RoomInputDto } from './dto/room-input.dto';
import { ReplaceAvailabilityRulesDto } from './dto/availability-rule-input.dto';
import { BlockedPeriodInputDto } from './dto/blocked-period-input.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { RoomStatus } from '../../common/constants/provider.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

@ApiTags('Provider')
@Controller('provider/rooms')
@Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

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
  @ApiOperation({ summary: 'List my rooms' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.listByProvider(this.requireProviderId(user));
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a room (subject to plan-tier limits, 25_PROVIDER_ARCHITECTURE.md §25.2)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RoomInputDto,
  ) {
    return this.roomsService.create(this.requireProviderId(user), dto);
  }

  @Patch(':roomId')
  @ApiOperation({ summary: 'Update a room' })
  async update(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RoomInputDto,
  ) {
    return this.roomsService.update(roomId, this.requireProviderId(user), dto);
  }

  @Patch(':roomId/status')
  @ApiOperation({ summary: 'Change room status (DRAFT/ACTIVE/INACTIVE)' })
  async setStatus(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { status: RoomStatus },
  ) {
    return this.roomsService.setStatus(
      roomId,
      this.requireProviderId(user),
      body.status,
    );
  }

  @Post(':roomId/photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a room photo (subject to plan-tier photo limits, §25.2)',
  })
  @UseInterceptors(FileInterceptor('file'))
  async addPhoto(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('isCover') isCover?: string,
  ) {
    if (!file) {
      throw new DomainException(
        'FILE_REQUIRED',
        'A photo file is required.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.roomsService.addPhoto(
      roomId,
      this.requireProviderId(user),
      file,
      isCover === 'true',
    );
  }

  @Put(':roomId/availability-rules')
  @ApiOperation({
    summary: "Replace this room's availability rules (full-replace semantics)",
  })
  async replaceAvailabilityRules(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplaceAvailabilityRulesDto,
  ) {
    return this.roomsService.replaceAvailabilityRules(
      roomId,
      this.requireProviderId(user),
      dto.rules,
    );
  }

  @Post(':roomId/blocked-periods')
  @ApiOperation({
    summary: 'Block ad-hoc time on a room (maintenance, private closure)',
  })
  async addBlockedPeriod(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BlockedPeriodInputDto,
  ) {
    return this.roomsService.addBlockedPeriod(
      roomId,
      this.requireProviderId(user),
      user.userId,
      dto,
    );
  }
}
