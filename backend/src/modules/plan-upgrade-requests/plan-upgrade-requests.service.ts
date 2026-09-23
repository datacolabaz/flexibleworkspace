import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PlanUpgradeRequestEntity } from './entities/plan-upgrade-request.entity';
import { PlanUpgradeRequestStatus } from '../../common/constants/plan-upgrade-request.enum';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';
import { ProvidersService } from '../providers/providers.service';
import type { ProviderPlanTier } from '../../common/constants/provider.enum';

/**
 * See the 1700000000015-PlanUpgradeRequest migration's comment for why
 * this exists — the same "supply first, high-touch ops" pattern as
 * `LeadsService`, for a provider wanting a higher plan tier while there's
 * no live payment gateway to self-serve that.
 */
@Injectable()
export class PlanUpgradeRequestsService {
  constructor(
    @InjectRepository(PlanUpgradeRequestEntity)
    private readonly requestRepo: Repository<PlanUpgradeRequestEntity>,
    private readonly providersService: ProvidersService,
  ) {}

  /**
   * Idempotent by design — a provider re-submitting while they already
   * have an open request just gets that same request back, rather than
   * piling up duplicate rows an admin has to de-dupe by hand.
   */
  async requestUpgrade(
    providerId: string,
    note?: string,
  ): Promise<PlanUpgradeRequestEntity> {
    const existing = await this.requestRepo.findOne({
      where: { providerId, status: PlanUpgradeRequestStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    if (existing) return existing;

    const request = this.requestRepo.create({
      providerId,
      note: note?.trim() || null,
      status: PlanUpgradeRequestStatus.PENDING,
      createdAt: new Date(),
    });
    return this.requestRepo.save(request);
  }

  /** The calling provider's own most recent open request, or null — lets the panel show "request sent, we'll follow up" instead of the form again. */
  async myLatestPending(
    providerId: string,
  ): Promise<PlanUpgradeRequestEntity | null> {
    return this.requestRepo.findOne({
      where: { providerId, status: PlanUpgradeRequestStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  async listForAdmin(
    status?: PlanUpgradeRequestStatus,
  ): Promise<PlanUpgradeRequestEntity[]> {
    return this.requestRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /**
   * Marks a request resolved and, when `grantPlanTier` is given, grants
   * that plan tier in the same call (`ProvidersService.setPlanTier`
   * writes its own audit-log entry — this method doesn't duplicate it).
   */
  async resolve(
    requestId: string,
    adminUserId: string,
    grantPlanTier?: ProviderPlanTier,
  ): Promise<PlanUpgradeRequestEntity> {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
    });
    if (!request) throw new ResourceNotFoundException('PlanUpgradeRequest');

    if (grantPlanTier) {
      await this.providersService.setPlanTier(
        request.providerId,
        adminUserId,
        grantPlanTier,
      );
    }

    request.status = PlanUpgradeRequestStatus.RESOLVED;
    request.resolvedAt = new Date();
    request.resolvedByUserId = adminUserId;
    return this.requestRepo.save(request);
  }
}
