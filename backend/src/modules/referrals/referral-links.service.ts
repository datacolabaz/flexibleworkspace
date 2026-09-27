import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';

import { ReferralLinkEntity } from './entities/referral-link.entity';
import { ReferralLinkClickEntity } from './entities/referral-link-click.entity';
import { CreateReferralLinkDto } from './dto/create-referral-link.dto';
import {
  ReferralLinkDestinationType,
  ReferralLinkOwnerType,
} from '../../common/constants/attribution.enum';
import { DomainException } from '../../common/exceptions/domain.exception';

@Injectable()
export class ReferralLinksService {
  constructor(
    @InjectRepository(ReferralLinkEntity)
    private readonly linkRepo: Repository<ReferralLinkEntity>,
    @InjectRepository(ReferralLinkClickEntity)
    private readonly clickRepo: Repository<ReferralLinkClickEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createForProvider(
    providerId: string,
    dto: CreateReferralLinkDto,
  ): Promise<ReferralLinkEntity> {
    const destinationType = dto.destinationType
      ? (dto.destinationType as ReferralLinkDestinationType)
      : ReferralLinkDestinationType.LOCATION;
    if (destinationType === ReferralLinkDestinationType.EVENT) {
      throw new DomainException(
        'INVALID_DESTINATION',
        'Providers can only create links to their own locations or the homepage.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      destinationType === ReferralLinkDestinationType.LOCATION &&
      dto.destinationId
    ) {
      const rows = await this.dataSource.query(
        `SELECT id FROM location WHERE id = $1 AND provider_id = $2`,
        [dto.destinationId, providerId],
      );
      if (!rows[0]) {
        throw new DomainException(
          'LOCATION_NOT_OWNED',
          'You can only create referral links for your own locations.',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return this.insertLink({
      ownerType: ReferralLinkOwnerType.PROVIDER,
      ownerId: providerId,
      dto,
      destinationType,
    });
  }

  async createForOrganizer(
    userId: string,
    dto: CreateReferralLinkDto,
  ): Promise<ReferralLinkEntity> {
    const destinationType = dto.destinationType
      ? (dto.destinationType as ReferralLinkDestinationType)
      : ReferralLinkDestinationType.EVENT;
    if (destinationType === ReferralLinkDestinationType.LOCATION) {
      throw new DomainException(
        'INVALID_DESTINATION',
        'Organizers can only create links to their own events or the homepage.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (destinationType === ReferralLinkDestinationType.EVENT) {
      if (!dto.destinationId) {
        throw new DomainException(
          'EVENT_REQUIRED',
          'destinationId is required for event referral links.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const rows = await this.dataSource.query(
        `SELECT id FROM events WHERE id = $1 AND organizer_id = $2 AND deleted_at IS NULL`,
        [dto.destinationId, userId],
      );
      if (!rows[0]) {
        throw new DomainException(
          'EVENT_NOT_OWNED',
          'You can only create referral links for your own events.',
          HttpStatus.FORBIDDEN,
        );
      }
    }
    return this.insertLink({
      ownerType: ReferralLinkOwnerType.ORGANIZER,
      ownerId: userId,
      dto,
      destinationType,
    });
  }

  async listForOwner(
    ownerType: ReferralLinkOwnerType,
    ownerId: string,
  ): Promise<ReferralLinkEntity[]> {
    return this.linkRepo.find({
      where: { ownerType, ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(
    ownerType: ReferralLinkOwnerType,
    ownerId: string,
    linkId: string,
  ): Promise<ReferralLinkEntity> {
    const link = await this.linkRepo.findOne({ where: { id: linkId } });
    if (!link || link.ownerType !== ownerType || link.ownerId !== ownerId) {
      throw new DomainException(
        'REFERRAL_LINK_NOT_FOUND',
        'Referral link not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    link.revokedAt = new Date();
    link.isActive = false;
    return this.linkRepo.save(link);
  }

  /**
   * Public /r/{code} fallback after partner campaign lookup misses.
   * Invalid/revoked codes return null so the controller still redirects home.
   */
  async trackClick(params: {
    code: string;
    landingPath: string;
  }): Promise<{ attributionToken: string; attributionWindowDays: number } | null> {
    const link = await this.linkRepo.findOne({ where: { code: params.code } });
    if (!link || !link.isActive || link.revokedAt) return null;

    const now = new Date();
    const attributionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      now.getTime() + link.attributionWindowDays * 86_400_000,
    );
    await this.clickRepo.save(
      this.clickRepo.create({
        referralLinkId: link.id,
        attributionToken,
        landingPath: params.landingPath,
        createdAt: now,
        expiresAt,
      }),
    );
    await this.linkRepo.increment({ id: link.id }, 'clickCount', 1);
    return {
      attributionToken,
      attributionWindowDays: link.attributionWindowDays,
    };
  }

  private async insertLink(params: {
    ownerType: ReferralLinkOwnerType;
    ownerId: string;
    dto: CreateReferralLinkDto;
    destinationType: ReferralLinkDestinationType;
  }): Promise<ReferralLinkEntity> {
    const code = await this.mintUniqueCode();
    const now = new Date();
    const link = this.linkRepo.create({
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      code,
      destinationType: params.destinationType,
      destinationId: params.dto.destinationId ?? null,
      campaign: params.dto.campaign ?? null,
      attributionWindowDays: params.dto.attributionWindowDays ?? 7,
      isActive: true,
      clickCount: 0,
      createdAt: now,
      revokedAt: null,
    });
    return this.linkRepo.save(link);
  }

  private async mintUniqueCode(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = randomBytes(5).toString('base64url').replace(/[_-]/g, 'X').slice(0, 8);
      const existingLink = await this.linkRepo.findOne({ where: { code } });
      if (existingLink) continue;
      const campaign = await this.dataSource.query(
        `SELECT id FROM referral_campaign WHERE code = $1 LIMIT 1`,
        [code],
      );
      if (campaign[0]) continue;
      return code;
    }
    throw new DomainException(
      'CODE_GENERATION_FAILED',
      'Could not allocate a unique referral code.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
