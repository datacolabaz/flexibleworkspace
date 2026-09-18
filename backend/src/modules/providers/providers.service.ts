import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProviderEntity } from './entities/provider.entity';
import { ProviderVerificationEventEntity } from './entities/provider-verification-event.entity';
import { UserRoleEntity } from '../auth/entities/user-role.entity';
import { RoleName } from '../../common/constants/roles.enum';
import { ProviderVerificationStatus } from '../../common/constants/provider.enum';
import { CreateProviderDto } from './dto/create-provider.dto';
import { VerifyProviderDto } from './dto/verify-provider.dto';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';

/**
 * 09_DOMAIN_MODEL.md §9.2 (Provider) / 25_PROVIDER_ARCHITECTURE.md.
 * Provider lifecycle: PENDING -> VERIFIED|REJECTED (admin action),
 * VERIFIED <-> SUSPENDED (admin action, reversible).
 */
@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    @InjectRepository(ProviderVerificationEventEntity)
    private readonly verificationEventRepo: Repository<ProviderVerificationEventEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepo: Repository<UserRoleEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  private slugify(input: string): string {
    return (
      input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'provider'
    );
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = this.slugify(base);
    let suffix = 0;
    // Small collision space in practice (provider names rarely collide),
    // but never silently return a duplicate slug (DB has UNIQUE(slug)).
    while (await this.providerRepo.findOne({ where: { slug } })) {
      suffix += 1;
      slug = `${this.slugify(base)}-${suffix}`;
    }
    return slug;
  }

  /**
   * Self-service provider registration (09_DOMAIN_MODEL.md §9.2). Grants the
   * requesting user PROVIDER_OWNER scoped to the new provider immediately —
   * verification gates ACTIVE room visibility (Room lifecycle), not the
   * ability to start configuring a listing.
   */
  async create(
    ownerUserId: string,
    dto: CreateProviderDto,
  ): Promise<ProviderEntity> {
    const now = new Date();
    const slug = await this.uniqueSlug(dto.displayName);

    const provider = this.providerRepo.create({
      legalName: dto.legalName,
      displayName: dto.displayName,
      slug,
      ownerUserId,
      category: dto.category ?? null,
      verificationStatus: ProviderVerificationStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.providerRepo.save(provider);

    await this.roleRepo.save(
      this.roleRepo.create({
        userId: ownerUserId,
        role: RoleName.PROVIDER_OWNER,
        providerId: saved.id,
        createdAt: now,
      }),
    );

    await this.verificationEventRepo.save(
      this.verificationEventRepo.create({
        providerId: saved.id,
        status: ProviderVerificationStatus.PENDING,
        reviewedByUserId: null,
        notes: 'Provider self-registered.',
        createdAt: now,
      }),
    );

    return saved;
  }

  async findById(id: string): Promise<ProviderEntity> {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider || provider.deletedAt)
      throw new ResourceNotFoundException('Provider');
    return provider;
  }

  /**
   * Resolves the caller's own provider from their JWT role claims
   * (11_API_CONTRACTS.md §11.4 ownership checks — enforced here at the
   * service layer, not only by route structure).
   */
  async findMine(callerProviderId: string | null): Promise<ProviderEntity> {
    if (!callerProviderId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.findById(callerProviderId);
  }

  async listForAdmin(
    verificationStatus?: ProviderVerificationStatus,
  ): Promise<ProviderEntity[]> {
    return this.providerRepo.find({
      where: verificationStatus ? { verificationStatus } : {},
      order: { createdAt: 'DESC' },
    });
  }

  /** Admin verify/reject (24_ADMIN_ARCHITECTURE.md §24.2). Also writes the generic AuditLog (§33.6), alongside the domain-specific ProviderVerificationEvent history. */
  async verify(
    providerId: string,
    adminUserId: string,
    dto: VerifyProviderDto,
  ): Promise<ProviderEntity> {
    const provider = await this.findById(providerId);
    const before = { verificationStatus: provider.verificationStatus };
    provider.verificationStatus = dto.decision;
    provider.updatedAt = new Date();
    const saved = await this.providerRepo.save(provider);

    await this.verificationEventRepo.save(
      this.verificationEventRepo.create({
        providerId,
        status: dto.decision,
        reviewedByUserId: adminUserId,
        notes: dto.notes ?? null,
        createdAt: new Date(),
      }),
    );

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      action: 'provider.verify',
      entityType: 'Provider',
      entityId: providerId,
      beforeState: before,
      afterState: { verificationStatus: dto.decision },
      reason: dto.notes ?? null,
    });

    return saved;
  }

  /**
   * Admin suspend / reinstate — reversible per the approved lifecycle.
   * A High-Risk action (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.5):
   * suspension always requires a reason.
   */
  async setSuspended(
    providerId: string,
    adminUserId: string,
    suspended: boolean,
    notes?: string,
  ): Promise<ProviderEntity> {
    if (suspended && !notes?.trim()) {
      throw new DomainException(
        'REASON_REQUIRED',
        'A reason is required to suspend a provider.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const provider = await this.findById(providerId);
    const before = { verificationStatus: provider.verificationStatus };
    provider.verificationStatus = suspended
      ? ProviderVerificationStatus.SUSPENDED
      : ProviderVerificationStatus.VERIFIED;
    provider.updatedAt = new Date();
    const saved = await this.providerRepo.save(provider);

    await this.verificationEventRepo.save(
      this.verificationEventRepo.create({
        providerId,
        status: provider.verificationStatus,
        reviewedByUserId: adminUserId,
        notes: notes ?? null,
        createdAt: new Date(),
      }),
    );

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      action: suspended ? 'provider.suspend' : 'provider.reinstate',
      entityType: 'Provider',
      entityId: providerId,
      beforeState: before,
      afterState: { verificationStatus: provider.verificationStatus },
      reason: notes ?? null,
    });

    return saved;
  }
}
