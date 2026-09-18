import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import configuration from '../src/config/configuration';
import { LocationsModule } from '../src/modules/locations/locations.module';
import { LocationsService } from '../src/modules/locations/locations.service';
import { AuthModule } from '../src/modules/auth/auth.module';
import {
  PlanLimitReachedException,
  ResourceNotFoundException,
} from '../src/common/exceptions/domain.exception';
import {
  PLAN_LOCATION_LIMITS,
  ProviderPlanTier,
} from '../src/common/constants/provider.enum';

/**
 * LocationsService touches `location.geo` (PostGIS) exclusively via raw SQL
 * (see the comment on LocationEntity / LocationsService) — mocking
 * DataSource.query for this would just assert "we called query with some
 * SQL string", which verifies nothing real. This runs the actual queries
 * against Postgres instead, the same discipline as
 * bookings-concurrency.e2e-spec.ts and search.e2e-spec.ts.
 *
 * AuthModule + JwtModule are included (unused directly by this test) for
 * the same reason as bookings-concurrency.e2e-spec.ts: ProvidersModule
 * registers UserRoleEntity, whose relation to AppUserEntity needs
 * AppUserEntity's metadata registered somewhere in the module tree —
 * AuthModule is what does that in the real AppModule.
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
    AuthModule,
    LocationsModule,
  ],
});

describe('LocationsService (real Postgres — PostGIS raw SQL)', () => {
  let app: Awaited<ReturnType<typeof TestAppModule.compile>>;
  let dataSource: DataSource;
  let locationsService: LocationsService;

  const suffix = `locations-test-${Date.now()}`;
  let ownerUserId: string;
  let freeProviderId: string;
  let otherProviderId: string;
  const createdLocationIds: string[] = [];

  beforeAll(async () => {
    app = await TestAppModule.compile();
    dataSource = app.get(getDataSourceToken());
    locationsService = app.get(LocationsService);

    const [user] = await dataSource.query(
      `INSERT INTO app_user (email, locale, is_active, created_at, updated_at)
       VALUES ($1, 'az', true, now(), now()) RETURNING id`,
      [`${suffix}@example.com`],
    );
    ownerUserId = user.id;

    const [freeProvider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Locations Test Free MMC', 'Locations Test Free', $1, $2, 'PENDING', 'FREE', now(), now()) RETURNING id`,
      [`${suffix}-free`, ownerUserId],
    );
    freeProviderId = freeProvider.id;

    const [otherProvider] = await dataSource.query(
      `INSERT INTO provider (legal_name, display_name, slug, owner_user_id, verification_status, plan_tier, created_at, updated_at)
       VALUES ('Locations Test Other MMC', 'Locations Test Other', $1, $2, 'VERIFIED', 'PRO', now(), now()) RETURNING id`,
      [`${suffix}-other`, ownerUserId],
    );
    otherProviderId = otherProvider.id;
  }, 30_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM location WHERE id = ANY($1::uuid[])`, [
      createdLocationIds,
    ]);
    await dataSource.query(`DELETE FROM provider WHERE id IN ($1, $2)`, [
      freeProviderId,
      otherProviderId,
    ]);
    await dataSource.query(`DELETE FROM app_user WHERE id = $1`, [ownerUserId]);
    await app.close();
  });

  it('creates a location with a real PostGIS point and reads back the same lat/lng', async () => {
    const location = await locationsService.create(freeProviderId, {
      name: 'HQ',
      addressLine: 'Test Street 1',
      city: 'Baku',
      lat: 40.4093,
      lng: 49.8671,
    } as any);
    createdLocationIds.push(location.id);

    expect(location.lat).toBeCloseTo(40.4093, 4);
    expect(location.lng).toBeCloseTo(49.8671, 4);
  });

  it(`enforces the FREE-tier location limit (${PLAN_LOCATION_LIMITS[ProviderPlanTier.FREE]}) — the previous create already used it up`, async () => {
    await expect(
      locationsService.create(freeProviderId, {
        name: 'Second Location',
        addressLine: 'Test Street 2',
        city: 'Baku',
        lat: 40.41,
        lng: 49.87,
      } as any),
    ).rejects.toBeInstanceOf(PlanLimitReachedException);
  });

  it('404s (not 403) when a provider tries to update a location it does not own', async () => {
    const existingId = createdLocationIds[0];
    await expect(
      locationsService.update(existingId, otherProviderId, {
        name: 'Hijacked Name',
        addressLine: 'Test Street 1',
        city: 'Baku',
        lat: 40.4093,
        lng: 49.8671,
      } as any),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });

  it('allows the owning provider to update its own location', async () => {
    const existingId = createdLocationIds[0];
    const updated = await locationsService.update(existingId, freeProviderId, {
      name: 'HQ Renamed',
      addressLine: 'Test Street 1 Updated',
      city: 'Baku',
      district: 'Yasamal',
      lat: 40.42,
      lng: 49.86,
    } as any);
    expect(updated.name).toBe('HQ Renamed');
    expect(updated.district).toBe('Yasamal');
    expect(updated.lat).toBeCloseTo(40.42, 4);
  });
});
