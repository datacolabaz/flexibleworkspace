import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppUserEntity } from './entities/app-user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';

/** The shape actually returned to the client — deliberately not the raw
 * AppUserEntity (which carries `passwordHash`). AdminUsersController
 * returns the raw entity to admins today (a pre-existing gap, not
 * introduced here), but this endpoint is reachable by every authenticated
 * customer, so it gets its own safe projection rather than repeating
 * that pattern. */
export interface ProfileResponse {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  locale: string;
  createdAt: Date;
}

function toProfileResponse(user: AppUserEntity): ProfileResponse {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    locale: user.locale,
    createdAt: user.createdAt,
  };
}

/** 09_DOMAIN_MODEL.md §User "Ownership: self (a user manages their own
 * profile)" — the self-service counterpart to AdminUsersService.update,
 * same displayName/locale allowlist. */
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(AppUserEntity)
    private readonly userRepo: Repository<AppUserEntity>,
  ) {}

  private async findActiveUser(userId: string): Promise<AppUserEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.deletedAt) throw new ResourceNotFoundException('User');
    return user;
  }

  async getProfile(userId: string): Promise<ProfileResponse> {
    return toProfileResponse(await this.findActiveUser(userId));
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponse> {
    const user = await this.findActiveUser(userId);
    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.locale !== undefined) user.locale = dto.locale;
    user.updatedAt = new Date();
    const saved = await this.userRepo.save(user);
    return toProfileResponse(saved);
  }
}
