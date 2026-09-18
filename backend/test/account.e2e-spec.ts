import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AccountService } from '../src/modules/auth/account.service';
import { ResourceNotFoundException } from '../src/common/exceptions/domain.exception';

/**
 * 09_DOMAIN_MODEL.md §User "Ownership: self (a user manages their own
 * profile)" — the self-service profile endpoint added for the
 * `/account/profile` frontend page. Same "real Postgres, not mocked repos"
 * discipline as favorites.e2e-spec.ts.
 */
const TestAppModule = Test.createTestingModule({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('db.host'),
        port: config.get('db.port'),
        username: config.get('db.username'),
        password: config.get('db.password'),
        database: config.get('db.database'),
        ssl: config.get('db.ssl'),
        autoLoadEntities: true,
        synchronize: false,
        logging: ['error'],
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.accessSecret'),
        signOptions: { expiresIn: config.get('jwt.accessExpiresIn') },
      }),
    }),
    AuthModule, // registers AccountController/AccountService alongside AuthController/AuthService, which needs JwtService above (same reason favorites.e2e-spec.ts imports it)
  ],
});

describe('Account profile (real Postgres)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let accountService: AccountService;

  const suffix = `account-test-${Date.now()}`;
  let userId: string;

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    accountService = app.get(AccountService);

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, phone, display_name, locale, is_active, created_at, updated_at)
       VALUES ($1, '+994501234567', 'Original Name', 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    userId = user.id;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM app_user WHERE id = $1`, [userId]);
    await app.close();
  });

  it('returns the real profile fields, never passwordHash', async () => {
    const profile = await accountService.getProfile(userId);
    expect(profile).toEqual({
      id: userId,
      email: `${suffix}@example.com`,
      phone: '+994501234567',
      displayName: 'Original Name',
      locale: 'az',
      createdAt: expect.any(Date),
    });
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('updates displayName and locale, leaving email/phone untouched (no route to change them here)', async () => {
    const updated = await accountService.updateProfile(userId, {
      displayName: 'New Name',
      locale: 'en',
    });
    expect(updated.displayName).toBe('New Name');
    expect(updated.locale).toBe('en');
    expect(updated.email).toBe(`${suffix}@example.com`);
    expect(updated.phone).toBe('+994501234567');

    // Persisted, not just returned — re-fetch confirms the write landed.
    const refetched = await accountService.getProfile(userId);
    expect(refetched.displayName).toBe('New Name');
    expect(refetched.locale).toBe('en');
  });

  it('leaves a field untouched when the DTO omits it', async () => {
    const updated = await accountService.updateProfile(userId, {
      displayName: 'Yet Another Name',
    });
    expect(updated.displayName).toBe('Yet Another Name');
    expect(updated.locale).toBe('en'); // unchanged from the previous test
  });

  it('rejects a lookup for a user that does not exist', async () => {
    await expect(
      accountService.getProfile('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
