import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { LeadEntity } from './entities/lead.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadStatus } from '../../common/constants/lead.enum';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

/**
 * Sprint 3 — see the 1700000000011-Leads migration's comment for why this
 * exists (no live payment gateway yet, so a customer's only way to convert
 * interest into a booking right now is a provider following up manually).
 */
@Injectable()
export class LeadsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(LeadEntity)
    private readonly leadRepo: Repository<LeadEntity>,
  ) {}

  /**
   * Public — no auth, no provider ownership check (the caller is an
   * anonymous site visitor). `providerId` is resolved server-side from the
   * room, never trusted from the request body.
   */
  async create(roomId: string, dto: CreateLeadDto): Promise<LeadEntity> {
    const [row] = await this.dataSource.query(
      `SELECT l.provider_id
       FROM room r JOIN location l ON l.id = r.location_id
       WHERE r.id = $1 AND r.deleted_at IS NULL AND l.deleted_at IS NULL`,
      [roomId],
    );
    if (!row) throw new ResourceNotFoundException('Room');

    const lead = this.leadRepo.create({
      roomId,
      providerId: row.provider_id,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail ?? null,
      message: dto.message ?? null,
      status: LeadStatus.NEW,
      createdAt: new Date(),
    });
    return this.leadRepo.save(lead);
  }

  async listForProvider(providerId: string): Promise<LeadEntity[]> {
    return this.leadRepo.find({
      where: { providerId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** Provider marks a lead's follow-up status — ownership enforced here, not just by route structure. */
  async updateStatus(
    leadId: string,
    providerId: string,
    userId: string,
    status: LeadStatus,
  ): Promise<LeadEntity> {
    const lead = await this.leadRepo.findOne({ where: { id: leadId } });
    if (!lead) throw new ResourceNotFoundException('Lead');
    if (lead.providerId !== providerId) {
      throw new DomainException(
        'NOT_YOUR_LEAD',
        'This lead does not belong to your provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    lead.status = status;
    if (status === LeadStatus.CONTACTED && !lead.contactedAt) {
      lead.contactedAt = new Date();
      lead.contactedByUserId = userId;
    }
    return this.leadRepo.save(lead);
  }
}
