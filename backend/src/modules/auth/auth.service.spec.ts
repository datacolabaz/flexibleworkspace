import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { AppUserEntity } from './entities/app-user.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { OtpCodeEntity } from './entities/otp-code.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { OAuthIdentityEntity } from './entities/oauth-identity.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RoleName } from '../../common/constants/roles.enum';
import { DomainException } from '../../common/exceptions/domain.exception';

// Google's SDK talks to Google's own key-fetching/JWT-verification
// internals we don't want a unit test depending on — only AuthService's
// handling of what verifyIdToken() returns is ours to test.
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

/**
 * Covers the highest-risk logic in the Auth module (18_SECURITY.md):
 * OTP correctness/expiry/attempt-lockout, silent account provisioning, and
 * refresh-token rotation-on-use. Repositories are deterministic in-memory
 * test doubles rather than mocks of TypeORM internals, per the Engineering
 * Operating Protocol's "tests for critical business logic" requirement.
 */
describe('AuthService', () => {
  let service: AuthService;

  // In-memory repository doubles, deterministic and inspectable.
  const users: AppUserEntity[] = [];
  const roles: UserRoleEntity[] = [];
  const otps: OtpCodeEntity[] = [];
  const refreshTokens: RefreshTokenEntity[] = [];
  const oauthIdentities: OAuthIdentityEntity[] = [];
  let idCounter = 0;
  const nextId = () => `id-${++idCounter}`;

  const makeRepo = <T extends { id?: string }>(store: T[]) => ({
    create: jest.fn((data: Partial<T>) => ({ ...data }) as T),
    save: jest.fn(async (entity: T) => {
      if (!entity.id) entity.id = nextId() as any;
      const idx = store.findIndex((e) => e.id === entity.id);
      if (idx >= 0) store[idx] = entity;
      else store.push(entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return (
        store.find((e) =>
          Object.entries(where).every(([k, v]) => {
            if (v === null) return (e as any)[k] == null;
            return (e as any)[k] === v;
          }),
        ) ?? null
      );
    }),
    find: jest.fn(async ({ where }: any) =>
      store.filter((e) =>
        Object.entries(where).every(([k, v]) => (e as any)[k] === v),
      ),
    ),
    delete: jest.fn(async () => ({ affected: 0 })),
  });

  beforeEach(async () => {
    users.length = 0;
    roles.length = 0;
    otps.length = 0;
    refreshTokens.length = 0;
    oauthIdentities.length = 0;
    idCounter = 0;
    mockVerifyIdToken.mockReset();
    (global as any).fetch = jest.fn();

    const configValues: Record<string, any> = {
      'otp.length': 6,
      'otp.ttlSeconds': 300,
      'jwt.accessSecret': 'test-secret',
      'jwt.accessExpiresIn': '15m',
      'jwt.refreshSecret': 'test-refresh-secret',
      'jwt.refreshExpiresIn': '30d',
      'oauth.google.clientId': 'test-google-client-id',
      'oauth.facebook.appId': 'test-fb-app-id',
      'oauth.facebook.appSecret': 'test-fb-app-secret',
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(AppUserEntity),
          useValue: makeRepo(users),
        },
        {
          provide: getRepositoryToken(UserRoleEntity),
          useValue: makeRepo(roles),
        },
        {
          provide: getRepositoryToken(OtpCodeEntity),
          useValue: makeRepo(otps),
        },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: makeRepo(refreshTokens),
        },
        {
          provide: getRepositoryToken(OAuthIdentityEntity),
          useValue: makeRepo(oauthIdentities),
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(() => 'signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
        {
          provide: NotificationsService,
          useValue: { sendOtp: jest.fn(async () => undefined) },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('requestOtp', () => {
    it('provisions a new account with a default CUSTOMER role on first request', async () => {
      await service.requestOtp('new-user@example.com');

      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('new-user@example.com');
      expect(roles).toHaveLength(1);
      expect(roles[0].role).toBe(RoleName.CUSTOMER);
      expect(otps).toHaveLength(1);
    });

    it('reuses the existing account on a subsequent request rather than creating a duplicate', async () => {
      await service.requestOtp('repeat@example.com');
      await service.requestOtp('repeat@example.com');

      expect(users).toHaveLength(1);
      expect(otps).toHaveLength(2); // a new OTP per request, but one user
    });
  });

  describe('verifyOtp', () => {
    it('rejects a code that does not match the stored hash, and increments attempt_count', async () => {
      await service.requestOtp('bob@example.com');

      await expect(
        service.verifyOtp('bob@example.com', '000000'),
      ).rejects.toBeInstanceOf(DomainException);
      expect(otps[0].attemptCount).toBe(1);
      expect(otps[0].consumedAt).toBeFalsy();
    });

    it('locks out after MAX_OTP_ATTEMPTS incorrect attempts', async () => {
      await service.requestOtp('carol@example.com');
      for (let i = 0; i < 5; i++) {
        await expect(
          service.verifyOtp('carol@example.com', '000000'),
        ).rejects.toBeInstanceOf(DomainException);
      }
      // 6th attempt: even a well-formed request is refused because the
      // attempt ceiling was already reached, not because the code is wrong.
      await expect(
        service.verifyOtp('carol@example.com', '000000'),
      ).rejects.toMatchObject({
        code: 'OTP_TOO_MANY_ATTEMPTS',
      });
    });

    it('rejects an expired code even if it is otherwise correct', async () => {
      await service.requestOtp('dana@example.com');
      otps[0].expiresAt = new Date(Date.now() - 1000);
      // We don't have the raw code (it's only hashed), but expiry is checked
      // before comparison, so any code — including a correct one — is refused.
      await expect(
        service.verifyOtp('dana@example.com', '123456'),
      ).rejects.toMatchObject({
        code: 'OTP_INVALID_OR_EXPIRED',
      });
    });

    it('accepts a correct, unexpired code exactly once and marks it consumed', async () => {
      // Bypass the notifications layer to capture the real generated code:
      // stub bcrypt-free path by inserting a known OTP directly.
      const user = {
        id: nextId(),
        email: 'erin@example.com',
        phone: null,
        locale: 'az',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        roles: [],
      } as unknown as AppUserEntity;
      users.push(user);
      roles.push({
        id: nextId(),
        userId: user.id,
        user,
        role: RoleName.CUSTOMER,
        providerId: null,
        createdAt: new Date(),
      } as UserRoleEntity);

      const rawCode = '135790';
      const codeHash = await bcrypt.hash(rawCode, 10);
      otps.push({
        id: nextId(),
        identifier: 'erin@example.com',
        codeHash,
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        attemptCount: 0,
        createdAt: new Date(),
      } as OtpCodeEntity);

      const result = await service.verifyOtp('erin@example.com', rawCode);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(otps[0].consumedAt).not.toBeNull();

      // Replaying the same (now-consumed) code must fail — verifyOtp only
      // ever looks at the latest OTP with consumedAt IS NULL.
      await expect(
        service.verifyOtp('erin@example.com', rawCode),
      ).rejects.toMatchObject({
        code: 'OTP_INVALID_OR_EXPIRED',
      });
    });
  });

  describe('refreshTokens (rotation on use)', () => {
    it('issues a new token pair and revokes the presented refresh token', async () => {
      const user = {
        id: nextId(),
        email: 'frank@example.com',
        phone: null,
        locale: 'az',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        roles: [],
      } as unknown as AppUserEntity;
      users.push(user);
      roles.push({
        id: nextId(),
        userId: user.id,
        user,
        role: RoleName.CUSTOMER,
        providerId: null,
        createdAt: new Date(),
      } as UserRoleEntity);

      const rawCode = '246810';
      otps.push({
        id: nextId(),
        identifier: 'frank@example.com',
        codeHash: await bcrypt.hash(rawCode, 10),
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        attemptCount: 0,
        createdAt: new Date(),
      } as OtpCodeEntity);

      const first = await service.verifyOtp('frank@example.com', rawCode);
      const originalTokenRow = refreshTokens.find(
        (t) => t.revokedAt === null || t.revokedAt === undefined,
      );
      expect(originalTokenRow).toBeDefined();

      const second = await service.refreshTokens(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(
        refreshTokens.find((t) => t.id === originalTokenRow!.id)!.revokedAt,
      ).not.toBeNull();

      // A revoked (already-used) refresh token must never be honored again —
      // this is the concrete defense against replay after theft (18_SECURITY.md).
      await expect(service.refreshTokens(first.refreshToken)).rejects.toThrow();
    });

    it('rejects an unknown refresh token', async () => {
      await expect(service.refreshTokens('not-a-real-token')).rejects.toThrow();
    });
  });

  describe('loginWithAdminPassword', () => {
    it('issues a token pair only for an active admin with a matching bcrypt hash', async () => {
      const user = {
        id: nextId(),
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash('correct-password-123', 10),
        phone: null,
        locale: 'az',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        roles: [],
      } as unknown as AppUserEntity;
      users.push(user);
      roles.push({
        id: nextId(),
        userId: user.id,
        user,
        role: RoleName.OPERATIONS_ADMIN,
        providerId: null,
        createdAt: new Date(),
      } as UserRoleEntity);

      const result = await service.loginWithAdminPassword(
        ' ADMIN@EXAMPLE.COM ',
        'correct-password-123',
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('rejects a correct password when the account has no admin role', async () => {
      await service.requestOtp('customer@example.com');
      users[0].passwordHash = await bcrypt.hash('correct-password-123', 10);

      await expect(
        service.loginWithAdminPassword(
          'customer@example.com',
          'correct-password-123',
        ),
      ).rejects.toMatchObject({ code: 'ADMIN_LOGIN_INVALID' });
    });

    it('rejects a wrong password without revealing whether the admin email exists', async () => {
      const user = {
        id: nextId(),
        email: 'admin2@example.com',
        passwordHash: await bcrypt.hash('correct-password-123', 10),
        phone: null,
        locale: 'az',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        roles: [],
      } as unknown as AppUserEntity;
      users.push(user);
      roles.push({
        id: nextId(),
        userId: user.id,
        user,
        role: RoleName.SUPER_ADMIN,
        providerId: null,
        createdAt: new Date(),
      } as UserRoleEntity);

      await expect(
        service.loginWithAdminPassword(
          'admin2@example.com',
          'wrong-password-123',
        ),
      ).rejects.toMatchObject({ code: 'ADMIN_LOGIN_INVALID' });
    });
  });

  describe('loginWithGoogle', () => {
    it('provisions a new account for a first-time verified Google sign-in', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-1',
          email: 'gina@example.com',
          email_verified: true,
          name: 'Gina',
        }),
      });

      const result = await service.loginWithGoogle('fake-id-token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('gina@example.com');
      expect(roles).toHaveLength(1);
      expect(oauthIdentities).toHaveLength(1);
      expect(oauthIdentities[0]).toMatchObject({
        provider: 'GOOGLE',
        providerUserId: 'google-sub-1',
      });
    });

    it('links to (never duplicates) an existing account with the same email', async () => {
      await service.requestOtp('heidi@example.com'); // pre-existing OTP account
      expect(users).toHaveLength(1);

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-2',
          email: 'heidi@example.com',
          email_verified: true,
        }),
      });
      await service.loginWithGoogle('fake-id-token');

      expect(users).toHaveLength(1); // still one account, now linked
      expect(oauthIdentities).toHaveLength(1);
      expect(oauthIdentities[0].userId).toBe(users[0].id);
    });

    it('rejects an unverified Google email', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-3',
          email: 'ivan@example.com',
          email_verified: false,
        }),
      });

      await expect(
        service.loginWithGoogle('fake-id-token'),
      ).rejects.toMatchObject({
        code: 'OAUTH_EMAIL_NOT_VERIFIED',
      });
      expect(users).toHaveLength(0);
    });

    it('rejects a token that fails signature verification', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('invalid signature'));

      await expect(service.loginWithGoogle('bad-token')).rejects.toMatchObject({
        code: 'OAUTH_TOKEN_INVALID',
      });
    });
  });

  describe('loginWithFacebook', () => {
    function mockGraphApi(profile: {
      id: string;
      email?: string;
      name?: string;
    }) {
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        if (url.includes('debug_token')) {
          return {
            ok: true,
            json: async () => ({
              data: { is_valid: true, app_id: 'test-fb-app-id' },
            }),
          };
        }
        return { ok: true, json: async () => profile };
      });
    }

    it('provisions a new account for a first-time verified Facebook sign-in', async () => {
      mockGraphApi({ id: 'fb-id-1', email: 'jack@example.com', name: 'Jack' });

      const result = await service.loginWithFacebook('fake-access-token');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('jack@example.com');
      expect(oauthIdentities[0]).toMatchObject({
        provider: 'FACEBOOK',
        providerUserId: 'fb-id-1',
      });
    });

    it('rejects a token whose app_id does not match ours (debug_token check)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { is_valid: true, app_id: 'someone-elses-app' },
        }),
      });

      await expect(
        service.loginWithFacebook('foreign-token'),
      ).rejects.toMatchObject({
        code: 'OAUTH_TOKEN_INVALID',
      });
      expect(users).toHaveLength(0);
    });

    it('rejects a profile with no email rather than creating an account without one', async () => {
      mockGraphApi({ id: 'fb-id-2' });

      await expect(
        service.loginWithFacebook('fake-access-token'),
      ).rejects.toMatchObject({
        code: 'OAUTH_EMAIL_REQUIRED',
      });
      expect(users).toHaveLength(0);
    });
  });
});
