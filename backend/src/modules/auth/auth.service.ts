import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { AppUserEntity } from './entities/app-user.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { OtpCodeEntity } from './entities/otp-code.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import {
  OAuthIdentityEntity,
  OAuthProvider,
} from './entities/oauth-identity.entity';
import { RoleName } from '../../common/constants/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import { HttpStatus } from '@nestjs/common';

const MAX_OTP_ATTEMPTS = 5;
const ADMIN_ROLE_NAMES = new Set<string>([
  RoleName.SUPER_ADMIN,
  RoleName.OPERATIONS_ADMIN,
  RoleName.FINANCE_ADMIN,
  RoleName.CONTENT_ADMIN,
  RoleName.SUPPORT_ADMIN,
  RoleName.MODERATION_ADMIN,
]);

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
    @InjectRepository(OAuthIdentityEntity)
    private readonly oauthRepo: Repository<OAuthIdentityEntity>,
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

  async loginWithAdminPassword(
    email: string,
    password: string,
  ): Promise<TokenPair> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });
    const roles = user
      ? await this.roleRepo.find({ where: { userId: user.id } })
      : [];
    const isAdmin = roles.some((role) => ADMIN_ROLE_NAMES.has(role.role));
    const passwordMatches = user?.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!user || !user.isActive || !isAdmin || !passwordMatches) {
      throw new DomainException(
        'ADMIN_LOGIN_INVALID',
        'Admin email or password is incorrect.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokenPair(user, roles);
  }

  /**
   * "Sign in with Google" — added alongside OTP, never replacing it
   * (05_USER_FLOWS.md §5.2 still applies: an account is per-email/phone,
   * not per login-method). The frontend uses Google Identity Services'
   * button, which hands back an ID token — a JWT ALREADY SIGNED BY GOOGLE
   * — so the only server-side work is verifying that signature against
   * Google's public keys and reading the claims out of it; no client
   * secret or redirect-URI dance needed for this flow.
   */
  async loginWithGoogle(idToken: string): Promise<TokenPair> {
    const clientId = this.configService.get<string>('oauth.google.clientId');
    if (!clientId) {
      this.logger.error(
        'Google Sign-In is not configured (GOOGLE_CLIENT_ID missing) — refusing rather than silently failing.',
      );
      throw new DomainException(
        'OAUTH_NOT_CONFIGURED',
        'Google sign-in is not available right now.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    let payload:
      | {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
        }
      | undefined;
    try {
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(
        `Google ID token verification failed: ${(err as Error).message}`,
      );
      throw new DomainException(
        'OAUTH_TOKEN_INVALID',
        'Could not verify Google sign-in. Please try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!payload?.sub || !payload.email) {
      throw new DomainException(
        'OAUTH_TOKEN_INVALID',
        'Could not verify Google sign-in. Please try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!payload.email_verified) {
      // The whole point of an identity-provider login is that THEY vouch
      // the email is real — 18_SECURITY.md's bar this feature exists to
      // meet. An unverified Google email gets no more trust than a bare
      // string typed into the OTP form would.
      throw new DomainException(
        'OAUTH_EMAIL_NOT_VERIFIED',
        "Your Google account's email is not verified.",
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.findOrCreateUserForOAuth(
      'GOOGLE',
      payload.sub,
      payload.email,
      payload.name ?? null,
    );
    const roles = await this.roleRepo.find({ where: { userId: user.id } });
    return this.issueTokenPair(user, roles);
  }

  /**
   * "Sign in with Facebook" — mirrors loginWithGoogle above, but Facebook's
   * JS SDK hands back a bare access token (not a signed JWT we can verify
   * offline), so two Graph API calls are needed: `debug_token` (with our
   * app's own id|secret) to confirm the token is genuinely valid AND was
   * issued to THIS app — skipping that check would let a token minted for
   * an unrelated Facebook app be replayed here — then `/me` to read the
   * verified profile it belongs to.
   */
  async loginWithFacebook(accessToken: string): Promise<TokenPair> {
    const appId = this.configService.get<string>('oauth.facebook.appId');
    const appSecret = this.configService.get<string>(
      'oauth.facebook.appSecret',
    );
    if (!appId || !appSecret) {
      this.logger.error(
        'Facebook Sign-In is not configured (FACEBOOK_APP_ID/FACEBOOK_APP_SECRET missing) — refusing rather than silently failing.',
      );
      throw new DomainException(
        'OAUTH_NOT_CONFIGURED',
        'Facebook sign-in is not available right now.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const debugResponse = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
      );
      const debugBody = (await debugResponse.json()) as {
        data?: { is_valid?: boolean; app_id?: string };
      };
      if (
        !debugResponse.ok ||
        !debugBody.data?.is_valid ||
        debugBody.data.app_id !== appId
      ) {
        throw new Error('token failed debug_token verification');
      }
    } catch (err) {
      this.logger.warn(
        `Facebook token verification failed: ${(err as Error).message}`,
      );
      throw new DomainException(
        'OAUTH_TOKEN_INVALID',
        'Could not verify Facebook sign-in. Please try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    let profile: { id?: string; email?: string; name?: string };
    try {
      const response = await fetch(
        `https://graph.facebook.com/me?fields=id,email,name&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (!response.ok)
        throw new Error(`Graph API returned ${response.status}`);
      profile = (await response.json()) as typeof profile;
    } catch (err) {
      this.logger.warn(
        `Facebook profile fetch failed: ${(err as Error).message}`,
      );
      throw new DomainException(
        'OAUTH_TOKEN_INVALID',
        'Could not verify Facebook sign-in. Please try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!profile.id) {
      throw new DomainException(
        'OAUTH_TOKEN_INVALID',
        'Could not verify Facebook sign-in. Please try again.',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (!profile.email) {
      // A person can decline the email permission at Facebook's consent
      // screen. We require it anyway — email is how this login path
      // merges with (or becomes) the person's app_user row, same as every
      // other login mechanism in this system; there's no separate
      // "phone-only Facebook account" concept to fall back to.
      throw new DomainException(
        'OAUTH_EMAIL_REQUIRED',
        'Please allow access to your email address to sign in with Facebook.',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.findOrCreateUserForOAuth(
      'FACEBOOK',
      profile.id,
      profile.email,
      profile.name ?? null,
    );
    const roles = await this.roleRepo.find({ where: { userId: user.id } });
    return this.issueTokenPair(user, roles);
  }

  /**
   * Shared by loginWithGoogle/loginWithFacebook. Unlike OTP's
   * findOrCreateUser (keyed on the raw identifier the person typed at that
   * moment), this is keyed on the PROVIDER's own id first — a returning
   * user is recognized by their linked oauth_identity row even if their
   * email changed provider-side since. Only on first sign-in with that
   * provider does it fall back to matching (and linking to) an existing
   * app_user by email, so someone who already has an OTP-based account
   * under the same email ends up with ONE account, not two, the first
   * time they use Google/Facebook — and every subsequent sign-in resolves
   * straight to that same account even if they later change their email
   * with the provider.
   */
  private async findOrCreateUserForOAuth(
    provider: OAuthProvider,
    providerUserId: string,
    email: string,
    displayName: string | null,
  ): Promise<AppUserEntity> {
    const existingIdentity = await this.oauthRepo.findOne({
      where: { provider, providerUserId },
    });
    if (existingIdentity) {
      const user = await this.userRepo.findOne({
        where: { id: existingIdentity.userId },
      });
      if (!user) {
        throw new DomainException(
          'USER_NOT_FOUND',
          'Account not found for this identifier.',
          HttpStatus.NOT_FOUND,
        );
      }
      return user;
    }

    const now = new Date();
    let user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      user = this.userRepo.create({
        email,
        phone: null,
        locale: 'az',
        displayName,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      user = await this.userRepo.save(user);

      await this.roleRepo.save(
        this.roleRepo.create({
          userId: user.id,
          role: RoleName.CUSTOMER,
          providerId: null,
          createdAt: now,
        }),
      );
      this.logger.log(
        `Provisioned new account ${user.id} via ${provider} sign-in`,
      );
    }

    await this.oauthRepo.save(
      this.oauthRepo.create({
        userId: user.id,
        provider,
        providerUserId,
        email,
        createdAt: now,
      }),
    );

    return user;
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
