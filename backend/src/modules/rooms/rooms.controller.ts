import {
  Body,
  Controller,
  Delete,
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
import {
  ConfirmPhotoDto,
  ConfirmVideoDto,
  PresignMediaDto,
  ReorderPhotosDto,
} from './dto/media-input.dto';
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

  @Get('types')
  @ApiOperation({
    summary:
      'Room type taxonomy (id + translationKey) for the "Add a room" form\'s type dropdown',
  })
  async listTypes() {
    return this.roomsService.listRoomTypes();
  }

  @Get('media/capabilities')
  @ApiOperation({
    summary:
      "This provider's media upload capabilities (direct-upload support + current plan's photo/video limits)",
  })
  async getMediaCapabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.roomsService.getMediaCapabilities(this.requireProviderId(user));
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

  // -- Media: photos (direct-to-storage path) -----------------------------

  @Get(':roomId/media')
  @ApiOperation({
    summary: "This room's photos + video, with display-ready URLs",
  })
  async getRoomMedia(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roomsService.getRoomMedia(roomId, this.requireProviderId(user));
  }

  @Post(':roomId/media/photos/presign')
  @ApiOperation({
    summary:
      'Get a presigned URL to upload a photo directly to storage (S3/R2 only)',
  })
  async presignPhoto(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignMediaDto,
  ) {
    return this.roomsService.presignPhotoUpload(
      roomId,
      this.requireProviderId(user),
      dto.originalFilename,
      dto.mimeType,
    );
  }

  @Post(':roomId/media/photos')
  @ApiOperation({
    summary:
      'Confirm a photo already uploaded to storage (metadata only, subject to plan photo limits)',
  })
  async confirmPhoto(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmPhotoDto,
  ) {
    return this.roomsService.confirmPhoto(
      roomId,
      this.requireProviderId(user),
      dto,
    );
  }

  @Delete(':roomId/media/photos/:photoId')
  @ApiOperation({ summary: 'Remove a room photo' })
  async removePhoto(
    @Param('roomId') roomId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roomsService.removePhoto(
      roomId,
      this.requireProviderId(user),
      photoId,
    );
  }

  @Put(':roomId/media/photos/order')
  @ApiOperation({
    summary: "Reorder this room's photos (full list of photoIds required)",
  })
  async reorderPhotos(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderPhotosDto,
  ) {
    return this.roomsService.reorderPhotos(
      roomId,
      this.requireProviderId(user),
      dto,
    );
  }

  @Patch(':roomId/media/photos/:photoId/cover')
  @ApiOperation({ summary: "Set this photo as the room's cover photo" })
  async setCoverPhoto(
    @Param('roomId') roomId: string,
    @Param('photoId') photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roomsService.setCoverPhoto(
      roomId,
      this.requireProviderId(user),
      photoId,
    );
  }

  @Post(':roomId/photos')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a room photo through the server (fallback for local/non-S3 environments — prefer the presigned /media/photos flow in production)',
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

  // -- Media: video (PRO/ENTERPRISE only) ----------------------------------

  @Post(':roomId/media/video/presign')
  @ApiOperation({
    summary:
      'Get a presigned URL to upload a video directly to storage (Pro plan only)',
  })
  async presignVideo(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignMediaDto,
  ) {
    return this.roomsService.presignVideoUpload(
      roomId,
      this.requireProviderId(user),
      dto.originalFilename,
      dto.mimeType,
    );
  }

  @Post(':roomId/media/video')
  @ApiOperation({
    summary:
      'Confirm a video already uploaded to storage (metadata only, subject to plan duration/size limits)',
  })
  async confirmVideo(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmVideoDto,
  ) {
    return this.roomsService.confirmVideo(
      roomId,
      this.requireProviderId(user),
      dto,
    );
  }

  @Delete(':roomId/media/video')
  @ApiOperation({ summary: "Remove this room's video" })
  async removeVideo(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.roomsService.removeVideo(roomId, this.requireProviderId(user));
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
