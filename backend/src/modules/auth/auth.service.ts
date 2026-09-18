import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { AppUserEntity } from './entities/app-user.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { OtpCodeEntity } from './entities/otp-code.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { RoleName } from '../../common/constants/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

const MAX_OTP_ATTEMPTS = 5;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(AppUserEntity)
    private readonly userRepo: Repository<AppUserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly roleRepo: Repository<UserRoleEntity>,
    @InjectRepository(OtpCodeEntity)
    private readonly otpRepo: Repository<OtpCodeEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private isEmail(identifier: string): boolean {
    return NotificationsService.isEmail(identifier);
  }

  /**
   * 05_USER_FLOWS.md §5.2 — "account created automatically ... email/phone
   * becomes the login." A first-time OTP request silently provisions the
   * account rather than requiring a separate signup step.
   */
  private async findOrCreateUser(identifier: string): Promise<AppUserEntity> {
    const isEmail = this.isEmail(identifier);
    const existing = await this.userRepo.findOne({
      where: isEmail ? { email: identifier } : { phone: identifier },
    });
    if (existing) return existing;

    const now = new Date();
    const user = this.userRepo.create({
      email: isEmail ? identifier : null,
      phone: isEmail ? null : identifier,
      locale: 'az',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.userRepo.save(user);

    // Default role on first account creation, per 09_DOMAIN_MODEL.md — every
    // user is at minimum a CUSTOMER; PROVIDER_OWNER/ADMIN/SUPPORT_OPS roles
    // are granted separately (provider signup, admin provisioning).
    await this.roleRepo.save(
      this.roleRepo.create({
        userId: saved.id,
        role: RoleName.CUSTOMER,
        providerId: null,
        createdAt: now,
      }),
    );
    this.logger.log(
      `Provisioned new account ${saved.id} for ${isEmail ? 'email' : 'phone'} identifier`,
    );
    return saved;
  }

  /**
   * Public wrapper around findOrCreateUser — used by BookingsService for the
   * guest-checkout path (05_USER_FLOWS.md: booking without forced
   * registration still needs an AppUser row, since notification/booking
   * ownership requires one; see NotificationsService's note on why).
   */
  async ensureUser(identifier: string): Promise<AppUserEntity> {
    return this.findOrCreateUser(identifier);
  }

  async requestOtp(identifier: string): Promise<void> {
    const user = await this.findOrCreateUser(identifier);

    const length = this.configService.get<number>('otp.length')!;
    const ttlSeconds = this.configService.get<number>('otp.ttlSeconds')!;
    const code = crypto
      .randomInt(0, 10 ** length)
      .toString()
      .padStart(length, '0');
    const codeHash = await bcrypt.hash(code, 10);

    await this.otpRepo.save(
      this.otpRepo.create({
        identifier,
        codeHash,
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        attemptCount: 0,
        createdAt: new Date(),
      }),
    );

    await this.notificationsService.sendOtp(
      user.id,
      identifier,
      code,
      user.locale,
    );
  }

  async verifyOtp(identifier: string, code: string): Promise<TokenPair> {
    const otp = await this.otpRepo.findOne({
      where: { identifier, consumedAt: null as unknown as Date },
      order: { createdAt: 'DESC' },
    });

    if (!otp || otp.expiresAt < new Date()) {
      throw new DomainException(
        'OTP_INVALID_OR_EXPIRED',
        'Code is invalid or has expired.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (otp.attemptCount >= MAX_OTP_ATTEMPTS) {
      throw new DomainException(
        'OTP_TOO_MANY_ATTEMPTS',
        'Too many incorrect attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const isMatch = await bcrypt.compare(code, otp.codeHash);
    if (!isMatch) {
      otp.attemptCount += 1;
      await this.otpRepo.save(otp);
      throw new DomainException(
        'OTP_INVALID_OR_EXPIRED',
        'Code is invalid or has expired.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    otp.consumedAt = new Date();
    await this.otpRepo.save(otp);

    const isEmail = this.isEmail(identifier);
    const user = await this.userRepo.findOne({
      where: isEmail ? { email: identifier } : { phone: identifier },
    });
    if (!user) {
      // Should not happen — requestOtp always provisions the user first —
      // but fail loudly rather than silently if state is ever inconsistent.
      throw new DomainException(
        'USER_NOT_FOUND',
        'Account not found for this identifier.',
        HttpStatus.NOT_FOUND,
      );
    }

    const roles = await this.roleRepo.find({ where: { userId: user.id } });
    return this.issueTokenPair(user, roles);
  }

  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.refreshRepo.findOne({ where: { tokenHash } });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired.',
      });
    }

    // Rotation: revoke the used token immediately (18_SECURITY.md — "secure
    // session/JWT rotation"). If a revoked token is ever presented again,
    // that's a strong signal of token theft/reuse.
    existing.revokedAt = new Date();

    const user = await this.userRepo.findOne({
      where: { id: existing.userId },
    });
    if (!user || !user.isActive) {
      await this.refreshRepo.save(existing);
      throw new UnauthorizedException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is no longer active.',
      });
    }
    const roles = await this.roleRepo.find({ where: { userId: user.id } });
    const pair = await this.issueTokenPair(user, roles);

    const newTokenRow = await this.refreshRepo.findOne({
      where: { tokenHash: this.hashToken(pair.refreshToken) },
    });
    existing.replacedById = newTokenRow?.id ?? null;
    await this.refreshRepo.save(existing);

    return pair;
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.refreshRepo.update({ tokenHash }, { revokedAt: new Date() });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async issueTokenPair(
    user: AppUserEntity,
    roles: UserRoleEntity[],
  ): Promise<TokenPair> {
    const rolesPayload = roles.map((r) => ({
      role: r.role,
      providerId: r.providerId,
    }));
    const accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
    )!;

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        phone: user.phone,
        roles: rolesPayload,
      },
      {
        secret: this.configService.get('jwt.accessSecret'),
        expiresIn: accessExpiresIn,
      },
    );

    const rawRefreshToken = crypto.randomBytes(48).toString('hex');
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    )!;
    const expiresAt = new Date(
      Date.now() + this.parseDurationMs(refreshExpiresIn),
    );

    await this.refreshRepo.save(
      this.refreshRepo.create({
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt,
        createdAt: new Date(),
      }),
    );

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: this.parseDurationMs(accessExpiresIn) / 1000,
    };
  }

  /** Parses simple durations like "15m", "30d", "1h" into milliseconds. */
  private parseDurationMs(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 15 * 60 * 1000;
    const [, amountStr, unit] = match;
    const amount = parseInt(amountStr, 10);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
    return amount * unitMs;
  }

  /** Periodic cleanup of expired OTP codes — called by a scheduled task (see AuthCleanupTask). */
  async purgeExpiredOtps(): Promise<number> {
    const result = await this.otpRepo.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }
}
