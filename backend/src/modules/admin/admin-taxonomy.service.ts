import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoomTypeEntity } from '../rooms/entities/room-type.entity';
import { AmenityEntity } from '../rooms/entities/amenity.entity';
import {
  CreateAmenityDto,
  CreateRoomTypeDto,
  UpdateAmenityDto,
  UpdateRoomTypeDto,
} from './dto/taxonomy.dto';
import { AuditLogService } from '../audit/audit-log.service';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §12 — "adding a Podcast Studio
 * category without a deploy." room_type/amenity (28_DATABASE_DDL.sql §3)
 * were seed-only reference tables until now; this is their first write
 * path, gated by CONTENT_ADMIN's taxonomy.update permission.
 */
@Injectable()
export class AdminTaxonomyService {
  constructor(
    @InjectRepository(RoomTypeEntity)
    private readonly roomTypeRepo: Repository<RoomTypeEntity>,
    @InjectRepository(AmenityEntity)
    private readonly amenityRepo: Repository<AmenityEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  listRoomTypes(): Promise<RoomTypeEntity[]> {
    return this.roomTypeRepo.find({ order: { translationKey: 'ASC' } });
  }

  async createRoomType(
    adminUserId: string,
    dto: CreateRoomTypeDto,
  ): Promise<RoomTypeEntity> {
    const roomType = this.roomTypeRepo.create({
      translationKey: dto.translationKey,
      parentTypeId: dto.parentTypeId ?? null,
      defaultCapacityMin: dto.defaultCapacityMin ?? null,
      defaultCapacityMax: dto.defaultCapacityMax ?? null,
      searchFacetWeight:
        dto.searchFacetWeight != null ? String(dto.searchFacetWeight) : '1.00',
      createdAt: new Date(),
    });
    const saved = await this.roomTypeRepo.save(roomType);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'RoomType',
      entityId: saved.id,
      action: 'CREATE',
      afterState: { ...dto },
    });
    return saved;
  }

  async updateRoomType(
    id: string,
    adminUserId: string,
    dto: UpdateRoomTypeDto,
  ): Promise<RoomTypeEntity> {
    const roomType = await this.roomTypeRepo.findOne({ where: { id } });
    if (!roomType) throw new ResourceNotFoundException('RoomType');
    const before = { ...roomType };
    roomType.translationKey = dto.translationKey;
    roomType.parentTypeId = dto.parentTypeId ?? null;
    roomType.defaultCapacityMin = dto.defaultCapacityMin ?? null;
    roomType.defaultCapacityMax = dto.defaultCapacityMax ?? null;
    if (dto.searchFacetWeight != null)
      roomType.searchFacetWeight = String(dto.searchFacetWeight);
    const saved = await this.roomTypeRepo.save(roomType);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'RoomType',
      entityId: id,
      action: 'UPDATE',
      beforeState: before,
      afterState: { ...saved },
    });
    return saved;
  }

  listAmenities(): Promise<AmenityEntity[]> {
    return this.amenityRepo.find({ order: { translationKey: 'ASC' } });
  }

  async createAmenity(
    adminUserId: string,
    dto: CreateAmenityDto,
  ): Promise<AmenityEntity> {
    const amenity = this.amenityRepo.create({
      translationKey: dto.translationKey,
      iconKey: dto.iconKey ?? null,
      category: dto.category ?? null,
    });
    const saved = await this.amenityRepo.save(amenity);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Amenity',
      entityId: saved.id,
      action: 'CREATE',
      afterState: { ...dto },
    });
    return saved;
  }

  async updateAmenity(
    id: string,
    adminUserId: string,
    dto: UpdateAmenityDto,
  ): Promise<AmenityEntity> {
    const amenity = await this.amenityRepo.findOne({ where: { id } });
    if (!amenity) throw new ResourceNotFoundException('Amenity');
    const before = { ...amenity };
    amenity.translationKey = dto.translationKey;
    amenity.iconKey = dto.iconKey ?? null;
    amenity.category = dto.category ?? null;
    const saved = await this.amenityRepo.save(amenity);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Amenity',
      entityId: id,
      action: 'UPDATE',
      beforeState: before,
      afterState: { ...saved },
    });
    return saved;
  }
}
