import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
export const PRIVATE_STORAGE_PROVIDER = 'PRIVATE_STORAGE_PROVIDER';

/**
 * S3StorageProvider is not implemented — no bucket/credentials are
 * available (REQUIRES USER ACTION, matching .env.example's S3_* block).
 * Only the 'local' driver is wired; switching STORAGE_DRIVER=s3 without an
 * implementation is a configuration error caught here at startup rather
 * than silently falling back, so nobody ships assuming S3 works.
 *
 * Two separate STORAGE_PROVIDER instances are registered from the same
 * LocalStorageProvider class, at two different on-disk locations:
 *  - STORAGE_PROVIDER (public) — room photos. Backed by `storage.localPath`
 *    (default `./uploads`), served publicly by `app.useStaticAssets` in
 *    main.ts under the `/uploads` prefix.
 *  - PRIVATE_STORAGE_PROVIDER (private) — provider verification documents
 *    (ID, business registration, etc). Backed by a SEPARATE directory,
 *    `storage.privateLocalPath` (default `./uploads-private`), which is
 *    never covered by any static-file middleware — the only way to read a
 *    file back is `getBuffer()` from an authenticated, admin-only route
 *    (ProvidersController). Sensitive personal/legal documents must never
 *    be reachable by a guessable public URL.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalStorageProvider(
          config.get<string>('storage.localPath') ?? './uploads',
          '/uploads',
        ),
    },
    {
      provide: PRIVATE_STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LocalStorageProvider(
          config.get<string>('storage.privateLocalPath') ?? './uploads-private',
          null,
        ),
    },
  ],
  exports: [STORAGE_PROVIDER, PRIVATE_STORAGE_PROVIDER],
})
export class StorageModule {}
