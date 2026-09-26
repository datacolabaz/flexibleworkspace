import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';

import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionGuard } from './common/guards/permission.guard';

import { AuthModule } from './modules/auth/auth.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { LocationsModule } from './modules/locations/locations.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { SearchModule } from './modules/search/search.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { PartnersModule } from './modules/partners/partners.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AiSearchModule } from './modules/ai-search/ai-search.module';
import { AdminModule } from './modules/admin/admin.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PlanUpgradeRequestsModule } from './modules/plan-upgrade-requests/plan-upgrade-requests.module';
import { EventsModule } from './modules/events/events.module';
import { PromoModule } from './modules/promo/promo.module';

@Module({
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
        synchronize: false, // schema is migration-driven only — 27_ADRS.md ADR-009
        logging:
          config.get('nodeEnv') === 'development'
            ? ['error', 'warn']
            : ['error'],
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

    // Rate limiting (11_API_CONTRACTS.md §11.5) — a conservative global default;
    // auth-sensitive endpoints (OTP request/verify) apply a stricter override
    // via @Throttle() at the controller level.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    AuthModule,
    ProvidersModule,
    LocationsModule,
    RoomsModule,
    SearchModule,
    BookingsModule,
    PaymentsModule,
    PayoutsModule,
    PartnersModule,
    ReviewsModule,
    FavoritesModule,
    NotificationsModule,
    AnalyticsModule,
    AiSearchModule,
    AdminModule,
    LeadsModule,
    PlanUpgradeRequestsModule,
    EventsModule,
    PromoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: ThrottlerGuard -> JwtAuthGuard (identity) -> RolesGuard
    // (coarse role check) -> PermissionGuard (fine module.action check,
    // 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.2/ADR-011).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
