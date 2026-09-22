import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { StorageProvider } from './storage-provider.interface';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
export const PRIVATE_STORAGE_PROVIDER = 'PRIVATE_STORAGE_PROVIDER';

/**
 * Two separate STORAGE_PROVIDER instances, switched together by a single
 * `STORAGE_DRIVER` env var (`local` | `s3`):
 *  - STORAGE_PROVIDER (public) — room photos/videos, provider logos.
 *  - PRIVATE_STORAGE_PROVIDER (private) — provider verification documents.
 *    Never reachable by a guessable public URL; the only way to read a
 *    file back is `getBuffer()`/a presigned GET from an authenticated,
 *    admin-only route.
 *
 * `local` (the default) writes to this app server's own disk — fine for
 * local development, but Railway's filesystem is NOT persistent across
 * deploys without an attached volume, so production must set
 * `STORAGE_DRIVER=s3` (22_INFRASTRUCTURE.md §22.7). `s3` targets any
 * S3-compatible provider (Cloudflare R2 recommended — see .env.example);
 * a config error is thrown at startup if `s3` is selected without the
 * required S3_* values set, rather than silently falling back to local
 * disk (nobody should ship believing object storage is active when it
 * isn't).
 */
function buildStorageProvider(
  config: ConfigService,
  kind: 'public' | 'private',
): StorageProvider {
  const driver = config.get<'local' | 's3'>('storage.driver');

  if (driver === 's3') {
    const s3 = config.get('storage.s3') as {
      endpoint: string;
      bucket: string;
      privateBucket: string;
      publicBaseUrl: string;
      accessKeyId: string;
      secretAccessKey: string;
      region: string;
    };
    const bucket = kind === 'public' ? s3.bucket : s3.privateBucket;
    if (!s3.endpoint || !bucket || !s3.accessKeyId || !s3.secretAccessKey) {
      throw new Error(
        `STORAGE_DRIVER=s3 requires S3_ENDPOINT, S3_${kind === 'public' ? '' : 'PRIVATE_'}BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to be set.`,
      );
    }
    return new S3StorageProvider(
      bucket,
      kind === 'public' ? s3.publicBaseUrl || null : null,
      s3.endpoint,
      s3.region,
      s3.accessKeyId,
      s3.secretAccessKey,
    );
  }

  return new LocalStorageProvider(
    kind === 'public'
      ? config.get<string>('storage.localPath') ?? './uploads'
      : (config.get<string>('storage.privateLocalPath') ?? './uploads-private'),
    kind === 'public' ? '/uploads' : null,
  );
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildStorageProvider(config, 'public'),
    },
    {
      provide: PRIVATE_STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildStorageProvider(config, 'private'),
    },
  ],
  exports: [STORAGE_PROVIDER, PRIVATE_STORAGE_PROVIDER],
})
export class StorageModule {}
