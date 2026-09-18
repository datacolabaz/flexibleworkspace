import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';

export interface RecordChangeParams {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
}

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.6 — the ONE path every admin
 * write goes through. A new admin endpoint that mutates state and forgets
 * to call this is a code-review-catchable omission, not a silent gap,
 * because it is one call in one place rather than per-controller discipline.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async recordChange(params: RecordChangeParams): Promise<AuditLogEntity> {
    return this.repo.save(
      this.repo.create({
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeState: params.beforeState ?? null,
        afterState: params.afterState ?? null,
        reason: params.reason ?? null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      }),
    );
  }

  async findById(id: string): Promise<AuditLogEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async list(filters: {
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    action?: string;
  }): Promise<AuditLogEntity[]> {
    return this.repo.find({
      where: {
        ...(filters.entityType ? { entityType: filters.entityType } : {}),
        ...(filters.entityId ? { entityId: filters.entityId } : {}),
        ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
        ...(filters.action ? { action: filters.action } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** §33.7 — marks a new row as the revert of an earlier one; the caller re-applies beforeState through the real domain service, this only records the linkage. */
  async recordRevert(
    originalId: string,
    params: RecordChangeParams,
  ): Promise<AuditLogEntity> {
    const entry = await this.recordChange(params);
    entry.revertedAuditLogId = originalId;
    return this.repo.save(entry);
  }
}
