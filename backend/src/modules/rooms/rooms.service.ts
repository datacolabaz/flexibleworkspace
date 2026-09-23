import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { RoomEntity } from './entities/room.entity';
import { AmenityEntity } from './entities/amenity.entity';
import { RoomTypeEntity } from './entities/room-type.entity';
import { AvailabilityRuleEntity } from './entities/availability-rule.entity';
import { BlockedPeriodEntity } from './entities/blocked-period.entity';
import { ModerationStatus, PhotoEntity } from './entities/photo.entity';
import { RoomInputDto } from './dto/room-input.dto';
import { AvailabilityRuleInputDto } from './dto/availability-rule-input.dto';
import { BlockedPeriodInputDto } from './dto/blocked-period-input.dto';
import {
  ConfirmPhotoDto,
  ConfirmVideoDto,
  ReorderPhotosDto,
} from './dto/media-input.dto';
import { LocationsService } from '../locations/locations.service';
import { ProvidersService } from '../providers/providers.service';
import {
  PLAN_ROOM_LIMITS,
  ProviderPlanTier,
  RoomStatus,
  canUploadVideo,
  getMaxImageCount,
  getMaxVideoDurationSeconds,
  getMaxVideoSizeBytes,
} from '../../common/constants/provider.enum';
import {
  DomainException,
  PlanLimitReachedException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import {
  PresignedUpload,
  StorageProvider,
  StoredFile,
} from '../storage/storage-provider.interface';
import { STORAGE_PROVIDER } from '../storage/storage.module';
import { Inject } from '@nestjs/common';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
    @InjectRepository(AmenityEntity)
    private readonly amenityRepo: Repository<AmenityEntity>,
    @InjectRepository(RoomTypeEntity)
    private readonly roomTypeRepo: Repository<RoomTypeEntity>,
    @InjectRepository(AvailabilityRuleEntity)
    private readonly availabilityRepo: Repository<AvailabilityRuleEntity>,
    @InjectRepository(BlockedPeriodEntity)
    private readonly blockedPeriodRepo: Repository<BlockedPeriodEntity>,
    @InjectRepository(PhotoEntity)
    private readonly photoRepo: Repository<PhotoEntity>,
    private readonly locationsService: LocationsService,
    private readonly providersService: ProvidersService,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  private slugify(input: string): string {
    return (
      input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'room'
    );
  }

  private async resolveAmenities(
    amenityIds?: string[],
  ): Promise<AmenityEntity[]> {
    if (!amenityIds || amenityIds.length === 0) return [];
    const amenities = await this.amenityRepo.find({
      where: { id: In(amenityIds) },
    });
    if (amenities.length !== new Set(amenityIds).size) {
      throw new DomainException(
        'INVALID_AMENITY',
        'One or more amenityIds do not exist.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return amenities;
  }

  /** Confirms `locationId` belongs to `providerId` — reuses the same 404-not-403 ownership pattern. */
  private async assertLocationOwnership(
    locationId: string,
    providerId: string,
  ): Promise<void> {
    const location = await this.locationsService.findById(locationId);
    if (location.providerId !== providerId) {
      throw new ResourceNotFoundException('Location');
    }
  }

  async create(providerId: string, dto: RoomInputDto): Promise<RoomEntity> {
    await this.assertLocationOwnership(dto.locationId, providerId);

    const provider = await this.providersService.findById(providerId);
    const limit = PLAN_ROOM_LIMITS[provider.planTier as ProviderPlanTier];
    const activeCount = await this.roomRepo.count({
      where: { location: { providerId } } as any,
      relations: ['location'],
    });
    if (activeCount >= limit) {
      throw new PlanLimitReachedException('rooms', {
        limit,
        planTier: provider.planTier,
      });
    }

    const roomType = await this.roomTypeRepo.findOne({
      where: { id: dto.roomTypeId },
    });
    if (!roomType)
      throw new DomainException(
        'INVALID_ROOM_TYPE',
        'Unknown roomTypeId.',
        HttpStatus.BAD_REQUEST,
      );

    const amenities = await this.resolveAmenities(dto.amenityIds);
    const now = new Date();

    const room = this.roomRepo.create({
      locationId: dto.locationId,
      roomTypeId: dto.roomTypeId,
      name: dto.name,
      slug: `${this.slugify(dto.name)}-${Date.now().toString(36)}`,
      description: dto.description ?? null,
      capacityMin: dto.capacityMin ?? 1,
      capacityMax: dto.capacityMax,
      sizeSqm: dto.sizeSqm != null ? String(dto.sizeSqm) : null,
      basePriceAmount: String(dto.basePriceAmount),
      basePriceCurrency: dto.basePriceCurrency ?? 'AZN',
      cancellationPolicy: dto.cancellationPolicy ?? null,
      status: RoomStatus.DRAFT,
      amenities,
      createdAt: now,
      updatedAt: now,
    });

    return this.roomRepo.save(room);
  }

  /**
   * Sprint 5 (provider self-service room creation) — the "Add a room"
   * form's room-type `<select>` needs real `room_type.id` UUIDs
   * (`RoomInputDto.roomTypeId`), not the `translation_key` strings the
   * public search taxonomy already exposes on the frontend
   * (`lib/constants/taxonomy.ts`). No endpoint returned that id<->key
   * mapping before this; kept provider-gated (same controller) rather
   * than public, since only the room-creation form needs it.
   */
  async listRoomTypes(): Promise<{ id: string; translationKey: string }[]> {
    return this.roomTypeRepo.find({
      select: ['id', 'translationKey'],
      order: { translationKey: 'ASC' },
    });
  }

  async findById(id: string): Promise<RoomEntity> {
    const room = await this.roomRepo.findOne({
      where: { id },
      relations: ['amenities', 'roomType', 'location'],
    });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');
    return room;
  }

  async update(
    id: string,
    providerId: string,
    dto: RoomInputDto,
  ): Promise<RoomEntity> {
    const room = await this.findById(id);
    if (room.location.providerId !== providerId)
      throw new ResourceNotFoundException('Room');

    if (dto.locationId !== room.locationId) {
      await this.assertLocationOwnership(dto.locationId, providerId);
      room.locationId = dto.locationId;
    }
    if (dto.roomTypeId !== room.roomTypeId) {
      const roomType = await this.roomTypeRepo.findOne({
        where: { id: dto.roomTypeId },
      });
      if (!roomType)
        throw new DomainException(
          'INVALID_ROOM_TYPE',
          'Unknown roomTypeId.',
          HttpStatus.BAD_REQUEST,
        );
      room.roomTypeId = dto.roomTypeId;
    }

    room.name = dto.name;
    room.description = dto.description ?? null;
    if (dto.capacityMin != null) room.capacityMin = dto.capacityMin;
    room.capacityMax = dto.capacityMax;
    room.sizeSqm = dto.sizeSqm != null ? String(dto.sizeSqm) : null;
    room.basePriceAmount = String(dto.basePriceAmount);
    if (dto.basePriceCurrency) room.basePriceCurrency = dto.basePriceCurrency;
    room.cancellationPolicy = dto.cancellationPolicy ?? null;
    if (dto.amenityIds)
      room.amenities = await this.resolveAmenities(dto.amenityIds);
    room.updatedAt = new Date();

    return this.roomRepo.save(room);
  }

  /**
   * DRAFT -> ACTIVE requires the owning provider to be VERIFIED
   * (09_DOMAIN_MODEL.md §9.2 Room lifecycle) AND at least one photo — a
   * provider flagged that the "Add a room" form doesn't ask for photos
   * up front (they're a separate per-room upload step, since a room
   * needs to exist before `POST provider/rooms/:id/photos` can target
   * it), so nothing previously stopped a photo-less room from going
   * live. Any other transition (-> INACTIVE, back to DRAFT) has no such
   * gate — a provider can always take a room down or edit it.
   */
  async setStatus(
    id: string,
    providerId: string,
    status: RoomStatus,
  ): Promise<RoomEntity> {
    const room = await this.findById(id);
    if (room.location.providerId !== providerId)
      throw new ResourceNotFoundException('Room');

    if (status === RoomStatus.ACTIVE) {
      const provider = await this.providersService.findById(providerId);
      if (provider.verificationStatus !== 'VERIFIED') {
        throw new DomainException(
          'PROVIDER_NOT_VERIFIED',
          'Your provider account must be verified before a room can go live.',
          HttpStatus.FORBIDDEN,
        );
      }

      const photoCount = await this.photoRepo.count({ where: { roomId: id } });
      if (photoCount === 0) {
        throw new DomainException(
          'ROOM_NO_PHOTOS',
          'Add at least one photo before this room can go live.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    room.status = status;
    room.updatedAt = new Date();
    return this.roomRepo.save(room);
  }

  async listByProvider(providerId: string): Promise<RoomEntity[]> {
    return this.roomRepo.find({
      where: { location: { providerId } } as any,
      relations: ['location', 'roomType', 'amenities'],
      order: { createdAt: 'DESC' },
    });
  }

  // -- Availability rules ---------------------------------------------------

  /** Full-replace semantics, matching PUT /provider/rooms/{roomId}/availability-rules. */
  async replaceAvailabilityRules(
    roomId: string,
    providerId: string,
    rules: AvailabilityRuleInputDto[],
  ): Promise<AvailabilityRuleEntity[]> {
    const room = await this.findById(roomId);
    if (room.location.providerId !== providerId)
      throw new ResourceNotFoundException('Room');

    await this.availabilityRepo.delete({ roomId });
    const now = new Date();
    const entities = rules.map((r) =>
      this.availabilityRepo.create({
        roomId,
        recurrenceType: r.recurrenceType,
        dayOfWeek: r.dayOfWeek ?? null,
        specificDate: r.specificDate ?? null,
        startTime: r.startTime,
        endTime: r.endTime,
        isOpen: r.isOpen ?? true,
        createdAt: now,
      }),
    );
    return this.availabilityRepo.save(entities);
  }

  // -- Blocked periods -------------------------------------------------------

  async addBlockedPeriod(
    roomId: string,
    providerId: string,
    createdByUserId: string,
    dto: BlockedPeriodInputDto,
  ): Promise<BlockedPeriodEntity> {
    const room = await this.findById(roomId);
    if (room.location.providerId !== providerId)
      throw new ResourceNotFoundException('Room');

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) {
      throw new DomainException(
        'INVALID_RANGE',
        'endAt must be after startAt.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const blocked = this.blockedPeriodRepo.create({
      roomId,
      startAt,
      endAt,
      reason: dto.reason ?? null,
      createdByUserId,
      createdAt: new Date(),
    });
    return this.blockedPeriodRepo.save(blocked);
  }

  // -- Media (photos + video) ------------------------------------------
  //
  // Provider Listing Media Specification — two upload paths coexist:
  //
  //  1. Direct-to-storage (preferred, and the ONLY path when
  //     `STORAGE_DRIVER=s3`): the client calls `presignPhotoUpload`/
  //     `presignVideoUpload` for a signed PUT URL, uploads the file
  //     bytes straight to the bucket, then calls `confirmPhoto`/
  //     `confirmVideo` with metadata only — file bytes never pass
  //     through this Node process (22_INFRASTRUCTURE.md §22.7).
  //  2. `addPhoto` (legacy multipart-through-server) — kept only
  //     because `LocalStorageProvider` has no presigned-URL concept,
  //     so local development without S3 credentials still needs a way
  //     to upload. Production (`STORAGE_DRIVER=s3`) should never use
  //     this path; `getMediaCapabilities` tells the frontend which
  //     path is available so it never has to guess.
  //
  // Every photo this module creates is auto-approved
  // (`ModerationStatus.APPROVED`) rather than left at the entity
  // default of `PENDING` — `PENDING` photos are invisible everywhere
  // public (`search.service.ts`/`favorites.service.ts` only select
  // `moderation_status = 'APPROVED'`), and nothing else in this
  // codebase ever transitions a photo out of `PENDING` (no admin
  // moderation flow exists, unlike `Review`). Providers are already
  // verification-gated before a room can go ACTIVE, so photos they
  // upload don't need a second manual-review queue on top of that.

  private async requireRoomOwnership(
    roomId: string,
    providerId: string,
  ): Promise<RoomEntity> {
    const room = await this.findById(roomId);
    if (room.location.providerId !== providerId)
      throw new ResourceNotFoundException('Room');
    return room;
  }

  private requireDirectUploadSupport(): void {
    if (!this.storageProvider.createPresignedUpload) {
      throw new DomainException(
        'DIRECT_UPLOAD_UNSUPPORTED',
        'Direct upload is not available in this environment. Use the fallback upload endpoint.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
  }

  /**
   * Tells the frontend, up front, which upload path to use and what
   * this provider's plan currently allows — so the UI can grey out
   * video entirely for Free/Starter and never has to feature-detect by
   * trial and error.
   */
  /**
   * Everything the room-editing UI needs to render its media section in
   * one call: display-ready URLs (never raw storageKeys — the frontend
   * has no StorageProvider of its own to resolve those) for every photo
   * plus the video, if any.
   */
  async getRoomMedia(
    roomId: string,
    providerId: string,
  ): Promise<{
    photos: {
      id: string;
      url: string;
      isCover: boolean;
      displayOrder: number;
    }[];
    video: {
      url: string;
      durationSeconds: number | null;
      sizeBytes: string | null;
      mimeType: string | null;
    } | null;
  }> {
    const room = await this.requireRoomOwnership(roomId, providerId);
    const photos = await this.photoRepo.find({
      where: { roomId },
      order: { displayOrder: 'ASC' },
    });
    return {
      photos: photos.map((p) => ({
        id: p.id,
        url: this.storageProvider.publicUrlFor(p.storageKey),
        isCover: p.isCover,
        displayOrder: p.displayOrder,
      })),
      video: room.videoStorageKey
        ? {
            url: this.storageProvider.publicUrlFor(room.videoStorageKey),
            durationSeconds: room.videoDurationSeconds,
            sizeBytes: room.videoSizeBytes,
            mimeType: room.videoMimeType,
          }
        : null,
    };
  }

  async getMediaCapabilities(providerId: string): Promise<{
    directUploadSupported: boolean;
    maxImageCount: number;
    videoAllowed: boolean;
    maxVideoCount: number;
    maxVideoDurationSeconds: number;
    maxVideoSizeBytes: number;
  }> {
    const provider = await this.providersService.findById(providerId);
    const plan = provider.planTier as ProviderPlanTier;
    return {
      directUploadSupported: !!this.storageProvider.createPresignedUpload,
      maxImageCount: getMaxImageCount(plan),
      videoAllowed: canUploadVideo(plan),
      maxVideoCount: canUploadVideo(plan) ? 1 : 0,
      maxVideoDurationSeconds: getMaxVideoDurationSeconds(plan),
      maxVideoSizeBytes: getMaxVideoSizeBytes(plan),
    };
  }

  async presignPhotoUpload(
    roomId: string,
    providerId: string,
    originalFilename: string,
    mimeType: string,
  ): Promise<PresignedUpload> {
    await this.requireRoomOwnership(roomId, providerId);
    this.requireDirectUploadSupport();

    const provider = await this.providersService.findById(providerId);
    const maxImages = getMaxImageCount(provider.planTier as ProviderPlanTier);
    const existingCount = await this.photoRepo.count({ where: { roomId } });
    if (existingCount >= maxImages) {
      throw new PlanLimitReachedException('photos on this room', {
        limit: maxImages,
        planTier: provider.planTier,
      });
    }

    return this.storageProvider.createPresignedUpload!(
      originalFilename,
      mimeType,
    );
  }

  async confirmPhoto(
    roomId: string,
    providerId: string,
    dto: ConfirmPhotoDto,
  ): Promise<PhotoEntity> {
    await this.requireRoomOwnership(roomId, providerId);

    const provider = await this.providersService.findById(providerId);
    const maxImages = getMaxImageCount(provider.planTier as ProviderPlanTier);
    const existingCount = await this.photoRepo.count({ where: { roomId } });
    if (existingCount >= maxImages) {
      throw new PlanLimitReachedException('photos on this room', {
        limit: maxImages,
        planTier: provider.planTier,
      });
    }

    // The browser PUTs the file straight to object storage and this call
    // only tells us it's done — verify server-side (via a HEAD request,
    // the same check confirmVideo() already does for its own upload)
    // rather than trusting that self-report. Without this, a PUT that
    // silently failed or never completed (dropped connection, CORS
    // misconfiguration, browser giving up) still left confirmPhoto()
    // creating a photo row that points at nothing — a broken thumbnail
    // that only shows up later, once the provider looks at the room.
    if (this.storageProvider.headSize) {
      try {
        await this.storageProvider.headSize(dto.storageKey);
      } catch {
        throw new DomainException(
          'PHOTO_UPLOAD_INCOMPLETE',
          'The uploaded photo could not be found in storage. Please try uploading it again.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (dto.isCover) {
      await this.photoRepo.update({ roomId }, { isCover: false });
    }

    const photo = this.photoRepo.create({
      roomId,
      storageKey: dto.storageKey,
      width: dto.width ?? null,
      height: dto.height ?? null,
      isCover: dto.isCover || existingCount === 0, // first photo is the cover by default
      moderationStatus: ModerationStatus.APPROVED,
      displayOrder: existingCount,
      createdAt: new Date(),
    });
    return this.photoRepo.save(photo);
  }

  /** Legacy multipart upload — see the module-level comment above for why this still exists. */
  async addPhoto(
    roomId: string,
    providerId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    isCover: boolean,
  ): Promise<PhotoEntity> {
    await this.requireRoomOwnership(roomId, providerId);

    const provider = await this.providersService.findById(providerId);
    const maxImages = getMaxImageCount(provider.planTier as ProviderPlanTier);
    const existingCount = await this.photoRepo.count({ where: { roomId } });
    if (existingCount >= maxImages) {
      throw new PlanLimitReachedException('photos on this room', {
        limit: maxImages,
        planTier: provider.planTier,
      });
    }

    const stored: StoredFile = await this.storageProvider.put(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    if (isCover) {
      await this.photoRepo.update({ roomId }, { isCover: false });
    }

    const photo = this.photoRepo.create({
      roomId,
      storageKey: stored.storageKey,
      isCover: isCover || existingCount === 0, // first photo is the cover by default
      moderationStatus: ModerationStatus.APPROVED,
      displayOrder: existingCount,
      createdAt: new Date(),
    });
    return this.photoRepo.save(photo);
  }

  async removePhoto(
    roomId: string,
    providerId: string,
    photoId: string,
  ): Promise<PhotoEntity[]> {
    await this.requireRoomOwnership(roomId, providerId);

    const photo = await this.photoRepo.findOne({
      where: { id: photoId, roomId },
    });
    if (!photo) throw new ResourceNotFoundException('Photo');

    await this.storageProvider.delete(photo.storageKey);
    await this.photoRepo.delete({ id: photoId });

    const remaining = await this.photoRepo.find({
      where: { roomId },
      order: { displayOrder: 'ASC' },
    });

    // Keep displayOrder contiguous and make sure a cover still exists
    // whenever at least one photo remains.
    const hasCover = remaining.some((p) => p.isCover);
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].displayOrder = i;
      if (!hasCover && i === 0) remaining[i].isCover = true;
    }
    if (remaining.length > 0) await this.photoRepo.save(remaining);

    return remaining;
  }

  async reorderPhotos(
    roomId: string,
    providerId: string,
    dto: ReorderPhotosDto,
  ): Promise<PhotoEntity[]> {
    await this.requireRoomOwnership(roomId, providerId);

    const existing = await this.photoRepo.find({ where: { roomId } });
    const existingIds = new Set(existing.map((p) => p.id));
    const requestedIds = new Set(dto.photoIds);
    if (
      existing.length !== dto.photoIds.length ||
      [...existingIds].some((id) => !requestedIds.has(id))
    ) {
      throw new DomainException(
        'INVALID_PHOTO_SET',
        'photoIds must list exactly the photos currently on this room.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const byId = new Map(existing.map((p) => [p.id, p]));
    dto.photoIds.forEach((id, index) => {
      byId.get(id)!.displayOrder = index;
    });
    return this.photoRepo.save(existing);
  }

  async setCoverPhoto(
    roomId: string,
    providerId: string,
    photoId: string,
  ): Promise<PhotoEntity[]> {
    await this.requireRoomOwnership(roomId, providerId);

    const photo = await this.photoRepo.findOne({
      where: { id: photoId, roomId },
    });
    if (!photo) throw new ResourceNotFoundException('Photo');

    await this.photoRepo.update({ roomId }, { isCover: false });
    await this.photoRepo.update({ id: photoId }, { isCover: true });

    return this.photoRepo.find({
      where: { roomId },
      order: { displayOrder: 'ASC' },
    });
  }

  // -- Video (PRO/ENTERPRISE only) ---------------------------------------

  private requireVideoAllowed(planTier: ProviderPlanTier): void {
    if (!canUploadVideo(planTier)) {
      throw new DomainException(
        'PLAN_VIDEO_NOT_ALLOWED',
        'Video is only available on the Pro plan. Upgrade to add a video to this room.',
        HttpStatus.PAYMENT_REQUIRED,
        { planTier },
      );
    }
  }

  async presignVideoUpload(
    roomId: string,
    providerId: string,
    originalFilename: string,
    mimeType: string,
  ): Promise<PresignedUpload> {
    await this.requireRoomOwnership(roomId, providerId);
    this.requireDirectUploadSupport();

    const provider = await this.providersService.findById(providerId);
    this.requireVideoAllowed(provider.planTier as ProviderPlanTier);

    return this.storageProvider.createPresignedUpload!(
      originalFilename,
      mimeType,
    );
  }

  async confirmVideo(
    roomId: string,
    providerId: string,
    dto: ConfirmVideoDto,
  ): Promise<RoomEntity> {
    const room = await this.requireRoomOwnership(roomId, providerId);

    const provider = await this.providersService.findById(providerId);
    const plan = provider.planTier as ProviderPlanTier;
    this.requireVideoAllowed(plan);

    const maxDuration = getMaxVideoDurationSeconds(plan);
    if (dto.durationSeconds > maxDuration) {
      await this.storageProvider.delete(dto.storageKey);
      throw new DomainException(
        'VIDEO_TOO_LONG',
        `Video must be ${maxDuration} seconds or shorter.`,
        HttpStatus.BAD_REQUEST,
        { maxDurationSeconds: maxDuration },
      );
    }

    // Duration is client-reported and can't be verified without
    // downloading/probing the file (accepted limitation — see the
    // Provider Listing Media Specification's security section); size
    // IS independently verified here via a HEAD request against the
    // actual uploaded object, never trusted from the client.
    const maxSize = getMaxVideoSizeBytes(plan);
    const actualSize = this.storageProvider.headSize
      ? await this.storageProvider.headSize(dto.storageKey)
      : 0;
    if (actualSize > maxSize) {
      await this.storageProvider.delete(dto.storageKey);
      throw new DomainException(
        'VIDEO_TOO_LARGE',
        `Video must be ${Math.round(maxSize / (1024 * 1024))}MB or smaller.`,
        HttpStatus.BAD_REQUEST,
        { maxSizeBytes: maxSize },
      );
    }

    if (room.videoStorageKey) {
      await this.storageProvider.delete(room.videoStorageKey);
    }

    room.videoStorageKey = dto.storageKey;
    room.videoDurationSeconds = Math.round(dto.durationSeconds);
    room.videoSizeBytes = String(actualSize);
    room.videoMimeType = dto.mimeType;
    room.updatedAt = new Date();
    return this.roomRepo.save(room);
  }

  async removeVideo(roomId: string, providerId: string): Promise<RoomEntity> {
    const room = await this.requireRoomOwnership(roomId, providerId);
    if (room.videoStorageKey) {
      await this.storageProvider.delete(room.videoStorageKey);
    }
    room.videoStorageKey = null;
    room.videoDurationSeconds = null;
    room.videoSizeBytes = null;
    room.videoMimeType = null;
    room.updatedAt = new Date();
    return this.roomRepo.save(room);
  }
}
