import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { AppUserEntity } from '../auth/entities/app-user.entity';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { AuditLogService } from '../audit/audit-log.service';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';

/** 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §2 — view/search/edit/suspend, with the field-level edit allowlist enforced by AdminUpdateUserDto rather than here (the DTO IS the allowlist). */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(AppUserEntity)
    private readonly userRepo: Repository<AppUserEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(q?: string): Promise<AppUserEntity[]> {
    if (!q)
      return this.userRepo.find({ order: { createdAt: 'DESC' }, take: 200 });
    return this.userRepo.find({
      where: [
        { email: Like(`%${q}%`) },
        { phone: Like(`%${q}%`) },
        { displayName: Like(`%${q}%`) },
      ],
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async findById(id: string): Promise<AppUserEntity> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['roles'],
    });
    if (!user || user.deletedAt) throw new ResourceNotFoundException('User');
    return user;
  }

  async update(
    id: string,
    adminUserId: string,
    dto: AdminUpdateUserDto,
  ): Promise<AppUserEntity> {
    const user = await this.findById(id);
    const before = { displayName: user.displayName, locale: user.locale };
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.locale !== undefined) user.locale = dto.locale;
    user.updatedAt = new Date();
    const saved = await this.userRepo.save(user);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'User',
      entityId: id,
      action: 'ADMIN_UPDATE',
      beforeState: before,
      afterState: { displayName: saved.displayName, locale: saved.locale },
      reason: dto.reason,
    });
    return saved;
  }

  async setSuspended(
    id: string,
    adminUserId: string,
    suspended: boolean,
    reason: string,
  ): Promise<AppUserEntity> {
    const user = await this.findById(id);
    const before = { isActive: user.isActive };
    user.isActive = !suspended;
    user.updatedAt = new Date();
    const saved = await this.userRepo.save(user);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'User',
      entityId: id,
      action: suspended ? 'SUSPEND' : 'REINSTATE',
      beforeState: before,
      afterState: { isActive: saved.isActive },
      reason,
    });
    return saved;
  }
}
