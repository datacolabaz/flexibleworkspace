import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RoomEntity } from '../rooms/entities/room.entity';
import { CorrectRoomDto } from './dto/correct-room.dto';
import { SetRoomFeaturedDto } from './dto/set-room-featured.dto';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

const CORRECTABLE_FIELDS = [
  'name',
  'description',
  'capacityMin',
  'capacityMax',
  'basePriceAmount',
  'status',
] as const;
type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §6/§7 — the "cross-provider
 * correction + audit trail + revert" primitive, using Room as the first
 * (and currently only) implementation. §33.7's "revert creates a NEW audit
 * event, re-applying the original through the real domain service" is
 * implemented literally: revert re-runs `correct()` with the prior values
 * as the patch, so a reverted correction is itself a fully audited
 * correction — the original audit_log row is never edited.
 *
 * This is deliberately NOT a generic "revert any audit_log row" endpoint:
 * different entities have different safe-undo semantics (a Payout's
 * PAID->AVAILABLE isn't a field patch, it's PayoutsService.reverse()'s own
 * ledger-clawback flow) — AuditLogService.recordRevert's own doc comment
 * says the caller "re-applies beforeState through the real domain service,"
 * which only makes sense per-entity-type. Room correction is the first of
 * what should become one revert path per correctable entity.
 */
@Injectable()
export class AdminListingsService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async listRooms(query = ''): Promise<Record<string, unknown>[]> {
    const search = query.trim();
    const builder = this.roomRepo
      .createQueryBuilder('room')
      .leftJoin('room.location', 'location')
      .leftJoin('location.provider', 'provider')
      .select([
        'room.id AS "id"',
        'room.name AS "name"',
        'room.status AS "status"',
        'room.capacity_min AS "capacityMin"',
        'room.capacity_max AS "capacityMax"',
        'room.base_price_amount AS "basePriceAmount"',
        'room.base_price_currency AS "basePriceCurrency"',
        'room.is_featured AS "isFeatured"',
        'room.updated_at AS "updatedAt"',
        'location.name AS "locationName"',
        'location.city AS "city"',
        'provider.display_name AS "providerName"',
      ])
      .where('room.deleted_at IS NULL')
      .orderBy('room.updated_at', 'DESC')
      .take(100);

    if (search) {
      builder.andWhere(
        '(room.name ILIKE :search OR provider.display_name ILIKE :search OR location.name ILIKE :search OR location.city ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    return builder.getRawMany();
  }

  private applyPatch(
    room: RoomEntity,
    patch: Partial<Record<CorrectableField, unknown>>,
  ): { before: Record<string, unknown>; after: Record<string, unknown> } {
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of CORRECTABLE_FIELDS) {
      if (patch[field] === undefined) continue;
      before[field] = (room as any)[field];
      (room as any)[field] =
        field === 'basePriceAmount' ? String(patch[field]) : patch[field];
      after[field] = (room as any)[field];
    }
    return { before, after };
  }

  async correctRoom(
    roomId: string,
    adminUserId: string,
    dto: CorrectRoomDto,
  ): Promise<RoomEntity> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');

    const {
      name,
      description,
      capacityMin,
      capacityMax,
      basePriceAmount,
      status,
    } = dto;
    const nextCapacityMin = capacityMin ?? room.capacityMin;
    const nextCapacityMax = capacityMax ?? room.capacityMax;
    if (nextCapacityMax < nextCapacityMin) {
      throw new DomainException(
        'INVALID_CAPACITY_RANGE',
        'capacityMax must be greater than or equal to capacityMin.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const { before, after } = this.applyPatch(room, {
      name,
      description,
      capacityMin,
      capacityMax,
      basePriceAmount,
      status,
    });
    if (Object.keys(after).length === 0) {
      throw new DomainException(
        'NO_FIELDS_TO_CORRECT',
        'At least one correctable field must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }

    room.updatedAt = new Date();
    const saved = await this.roomRepo.save(room);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Room',
      entityId: roomId,
      action: 'ADMIN_CORRECT',
      beforeState: before,
      afterState: after,
      reason: dto.reason,
    });

    return saved;
  }

  /**
   * Sprint 4 (Featured Listing) — admin-only on/off toggle, no expiry
   * date, no payment (confirmed with the product owner). Kept separate
   * from `correctRoom()`'s "fix wrong data" audit flow: this is a
   * routine marketing action, not a correction, so no `reason` is
   * required — but it's still recorded to the same audit log for
   * traceability (who featured/unfeatured which room, when).
   */
  async setFeatured(
    roomId: string,
    adminUserId: string,
    dto: SetRoomFeaturedDto,
  ): Promise<RoomEntity> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');

    const before = { isFeatured: room.isFeatured };
    room.isFeatured = dto.isFeatured;
    room.updatedAt = new Date();
    const saved = await this.roomRepo.save(room);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Room',
      entityId: roomId,
      action: 'ADMIN_FEATURE_TOGGLE',
      beforeState: before,
      afterState: { isFeatured: saved.isFeatured },
    });

    return saved;
  }

  /** Re-applies one prior correction's `beforeState` as a brand-new, audited correction (§33.7). */
  async revertRoomCorrection(
    roomId: string,
    auditLogId: string,
    adminUserId: string,
  ): Promise<RoomEntity> {
    const entry = await this.auditLogService.findById(auditLogId);
    if (
      !entry ||
      entry.entityType !== 'Room' ||
      entry.entityId !== roomId ||
      entry.action !== 'ADMIN_CORRECT'
    ) {
      throw new ResourceNotFoundException('Correction to revert');
    }
    if (!entry.beforeState || Object.keys(entry.beforeState).length === 0) {
      throw new DomainException(
        'NOTHING_TO_REVERT',
        'This audit entry has no prior values to restore.',
        HttpStatus.CONFLICT,
      );
    }

    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');

    const patch = entry.beforeState as Partial<
      Record<CorrectableField, unknown>
    >;
    const { before, after } = this.applyPatch(room, patch);
    room.updatedAt = new Date();
    const saved = await this.roomRepo.save(room);

    await this.auditLogService.recordRevert(auditLogId, {
      actorUserId: adminUserId,
      entityType: 'Room',
      entityId: roomId,
      action: 'ADMIN_REVERT',
      beforeState: before,
      afterState: after,
      reason: `Reverted correction ${auditLogId}.`,
    });

    return saved;
  }
}
