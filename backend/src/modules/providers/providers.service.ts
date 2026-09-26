import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { ProviderEntity } from './entities/provider.entity';
import { ProviderVerificationEventEntity } from './entities/provider-verification-event.entity';
import { ProviderDocumentHashEntity } from './entities/provider-document-hash.entity';
import { UserRoleEntity } from '../auth/entities/user-role.entity';
import { RoleName } from '../../common/constants/roles.enum';
import {
  ProviderPlanTier,
  ProviderVerificationDocumentType,
  ProviderVerificationStatus,
} from '../../common/constants/provider.enum';
import { CreateProviderDto } from './dto/create-provider.dto';
import { VerifyProviderDto } from './dto/verify-provider.dto';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../audit/audit-log.service';
import {
  PRIVATE_STORAGE_PROVIDER,
  STORAGE_PROVIDER,
} from '../storage/storage.module';
import { StorageProvider } from '../storage/storage-provider.interface';

/** Postgres unique-violation error code (matches reviews.service.ts's own constant). */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * 09_DOMAIN_MODEL.md §9.2 (Provider) / 25_PROVIDER_ARCHITECTURE.md.
 * Provider lifecycle: PENDING -> VERIFIED|REJECTED (admin action),
 * VERIFIED <-> SUSPENDED (admin action, reversible). Sprint 7 (2026-09-23,
 * the owner's explicit ask) replaces the "wait for an admin to click
 * Verify" step for the common case: PENDING -> VERIFIED now happens
 * automatically the moment a verification document clears the duplicate
 * check in addVerificationDocument() below. An admin can still SUSPEND or
 * REJECT afterward (`verify()`/`suspend()`, unchanged) — this only removes
 * the wait, not the ability to catch a bad actor after the fact.
 */
@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    @InjectRepository(ProviderVerificationEventEntity)
    private readonly verificationEventRepo: Repository<ProviderVerificationEventEntity>,
    @InjectRepository(ProviderDocumentHashEntity)
    private readonly documentHashRepo: Repository<ProviderDocumentHashEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepo: Repository<UserRoleEntity>,
    private readonly auditLogService: AuditLogService,
    @Inject(PRIVATE_STORAGE_PROVIDER)
    private readonly privateStorageProvider: StorageProvider,
    @Inject(STORAGE_PROVIDER)
    private readonly publicStorageProvider: StorageProvider,
    private readonly configService: ConfigService,
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

  async remove(
    providerId: string,
    adminUserId: string,
    reason: string,
  ): Promise<{ deleted: true }> {
    if (!reason?.trim() || reason.trim().length < 3) {
      throw new DomainException(
        'DELETE_REASON_REQUIRED',
        'A deletion reason of at least 3 characters is required.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const provider = await this.findById(providerId);
    const before = {
      verificationStatus: provider.verificationStatus,
      deletedAt: null,
    };
    provider.deletedAt = new Date();
    provider.updatedAt = new Date();
    await this.providerRepo.save(provider);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      action: 'provider.archive',
      entityType: 'Provider',
      entityId: providerId,
      beforeState: before,
      afterState: {
        verificationStatus: provider.verificationStatus,
        deletedAt: provider.deletedAt.toISOString(),
      },
      reason: reason.trim(),
    });
    return { deleted: true };
  }

  /**
   * Admin sets a provider's plan tier directly — standalone (a downgrade,
   * or granting a plan the provider never formally requested) and also
   * the action `PlanUpgradeRequestsService.resolve()` calls when an admin
   * grants a plan while resolving a request. Same audit-log discipline as
   * `verify()`/`setSuspended()` above; no separate approval workflow of
   * its own since — per the owner's "no payment integration for initial
   * launch" decision — every upgrade today is already a manual, trusted
   * admin action, not something a provider can trigger by paying.
   */
  async setPlanTier(
    providerId: string,
    adminUserId: string,
    planTier: ProviderPlanTier,
  ): Promise<ProviderEntity> {
    const provider = await this.findById(providerId);
    const before = { planTier: provider.planTier };
    provider.planTier = planTier;
    provider.updatedAt = new Date();
    const saved = await this.providerRepo.save(provider);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      action: 'provider.plan_manage',
      entityType: 'Provider',
      entityId: providerId,
      beforeState: before,
      afterState: { planTier },
      reason: null,
    });

    return saved;
  }

  /**
   * Provider self-service upload (POST providers/me/verification-documents).
   * Stored via PRIVATE_STORAGE_PROVIDER — see storage.module.ts — never
   * through the public STORAGE_PROVIDER used for room photos, since these
   * are sensitive personal/legal documents (ID, business registration,
   * address proof) that must stay admin-only.
   */
  /**
   * Fraud check shared by every document type (ID, business registration,
   * address proof, "other" — a driver's licence is just an ID_DOCUMENT
   * upload, no dedicated enum value needed): hashes the file's actual
   * bytes and rejects it outright if that exact file is already on record
   * for a DIFFERENT provider. Re-uploading the same file under your OWN
   * provider (fixing a wrong documentType, say) is fine and returns null.
   */
  private async findDuplicateDocumentOwner(
    fileHash: string,
    thisProviderId: string,
  ): Promise<ProviderDocumentHashEntity | null> {
    const existing = await this.documentHashRepo.findOne({
      where: { fileHash },
    });
    if (existing && existing.providerId !== thisProviderId) return existing;
    return null;
  }

  async addVerificationDocument(
    callerProviderId: string | null,
    documentType: ProviderVerificationDocumentType,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<ProviderEntity> {
    const provider = await this.findMine(callerProviderId);
    const fileHash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    const duplicate = await this.findDuplicateDocumentOwner(
      fileHash,
      provider.id,
    );
    if (duplicate) {
      throw new DomainException(
        'DUPLICATE_DOCUMENT',
        'This document has already been submitted on another account.',
        HttpStatus.CONFLICT,
      );
    }

    const stored = await this.privateStorageProvider.put(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    provider.verificationDocuments = [
      ...(provider.verificationDocuments ?? []),
      {
        type: documentType,
        storageKey: stored.storageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString(),
      },
    ];
    provider.updatedAt = new Date();

    // Sprint 7 (2026-09-23): a document that isn't a duplicate is enough to
    // auto-verify — no admin click required. Only PENDING moves; an admin's
    // own REJECTED/SUSPENDED decision is never silently overwritten by a
    // provider simply uploading another file.
    const wasPending =
      provider.verificationStatus === ProviderVerificationStatus.PENDING;
    if (wasPending) {
      provider.verificationStatus = ProviderVerificationStatus.VERIFIED;
    }

    const saved = await this.providerRepo.save(provider);

    try {
      await this.documentHashRepo.save(
        this.documentHashRepo.create({
          providerId: provider.id,
          fileHash,
          documentType,
          createdAt: new Date(),
        }),
      );
    } catch (err: any) {
      // Race: two providers uploaded the identical file in the same
      // instant and both passed the findDuplicateDocumentOwner check
      // above before either row existed. The document is already saved
      // on this provider at this point — surfacing this as a request
      // failure would be confusing (the upload actually went through),
      // so this is intentionally swallowed rather than thrown; the next
      // upload attempt (by whichever provider loses this race) will see
      // the now-inserted row and be caught normally.
      if (err?.code !== PG_UNIQUE_VIOLATION) throw err;
    }

    if (wasPending) {
      await this.verificationEventRepo.save(
        this.verificationEventRepo.create({
          providerId: provider.id,
          status: ProviderVerificationStatus.VERIFIED,
          reviewedByUserId: null,
          notes: 'Auto-verified on document upload (no duplicate found).',
          createdAt: new Date(),
        }),
      );
    }

    return saved;
  }

  /**
   * Admin-only document download (GET admin/providers/:id/verification-
   * documents/:storageKey) — the ONLY way any of these files are ever read
   * back; there is no public URL for them (LocalStorageProvider constructed
   * with `publicBase: null` for this token).
   */
  async getVerificationDocumentBuffer(
    providerId: string,
    storageKey: string,
  ): Promise<{ buffer: Buffer; mimeType: string; originalFilename: string }> {
    const provider = await this.findById(providerId);
    const doc = (provider.verificationDocuments ?? []).find(
      (d) => d.storageKey === storageKey,
    );
    if (!doc) throw new ResourceNotFoundException('Verification document');
    const buffer = await this.privateStorageProvider.getBuffer(storageKey);
    return {
      buffer,
      mimeType: doc.mimeType,
      originalFilename: doc.originalFilename,
    };
  }

  /**
   * Publicly-servable URL for a provider's logo — delegates to the
   * injected public StorageProvider (was a hand-rolled `/uploads/<key>`
   * derivation here until this pass, which produced a dead URL once a
   * logo was stored on S3/R2 rather than local disk; see the same fix
   * in `SearchService`/`FavoritesService`). `null` when the provider has
   * no logo yet.
   */
  publicLogoUrl(
    provider: Pick<ProviderEntity, 'logoStorageKey'>,
  ): string | null {
    if (!provider.logoStorageKey) return null;
    return this.publicStorageProvider.publicUrlFor(provider.logoStorageKey);
  }

  /**
   * Sets/replaces a provider's logo (`POST providers/:id/logo`). Ownership
   * is checked against `ownerUserId` directly — NOT the `@Roles`/
   * `currentProviderId` pattern the rest of this controller uses —
   * because this is deliberately callable in the SAME session as
   * self-registration (`create()`, above): access tokens embed role
   * claims at issue time (see `AuthService.issueTokenPair`), so a caller
   * who just registered has no PROVIDER_OWNER claim yet in their current
   * token and a role-gated route would 403 them. Checking the real
   * authenticated user id against `ownerUserId` works regardless of
   * token freshness, and is the same 404-not-403 cross-tenant pattern
   * used throughout (`RoomsService.assertLocationOwnership` etc).
   */
  async setLogo(
    providerId: string,
    callerUserId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<ProviderEntity> {
    const provider = await this.findById(providerId);
    if (provider.ownerUserId !== callerUserId) {
      throw new ResourceNotFoundException('Provider');
    }
    const stored = await this.publicStorageProvider.put(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    provider.logoStorageKey = stored.storageKey;
    provider.updatedAt = new Date();
    return this.providerRepo.save(provider);
  }
}
