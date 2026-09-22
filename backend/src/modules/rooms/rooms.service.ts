import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { RoomEntity } from './entities/room.entity';
import { AmenityEntity } from './entities/amenity.entity';
import { RoomTypeEntity } from './entities/room-type.entity';
import { AvailabilityRuleEntity } from './entities/availability-rule.entity';
import { BlockedPeriodEntity } from './entities/blocked-period.entity';
import { PhotoEntity } from './entities/photo.entity';
import { RoomInputDto } from './dto/room-input.dto';
import { AvailabilityRuleInputDto } from './dto/availability-rule-input.dto';
import { BlockedPeriodInputDto } from './dto/blocked-period-input.dto';
import { LocationsService } from '../locations/locations.service';
import { ProvidersService } from '../providers/providers.service';
import {
  PLAN_ROOM_LIMITS,
  ProviderPlanTier,
  RoomStatus,
} from '../../common/constants/provider.enum';
import {
  DomainException,
  PlanLimitReachedException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import {
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

  // -- Photos ------------------------------------------------------------

  async addPhoto(
    roomId: string,
    providerId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    isCover: boolean,
  ): Promise<PhotoEntity> {
    const room = await this.findById(roomId);
    if (room.location.providerId !== providerId)
      throw new ResourceNotFoundException('Room');

    const existingCount = await this.photoRepo.count({ where: { roomId } });
    const stored: StoredFile = await this.storageProvider.put(
      file.buffer,
      file.originalname,
      file.mimetype,
    );

    const photo = this.photoRepo.create({
      roomId,
      storageKey: stored.storageKey,
      isCover: isCover || existingCount === 0, // first photo is the cover by default
      displayOrder: existingCount,
      createdAt: new Date(),
    });
    return this.photoRepo.save(photo);
  }
}
