import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

/**
 * S3StorageProvider is not implemented — no bucket/credentials are
 * available (REQUIRES USER ACTION, matching .env.example's S3_* block).
 * Only the 'local' driver is wired; switching STORAGE_DRIVER=s3 without an
 * implementation is a configuration error caught here at startup rather
 * than silently falling back, so nobody ships assuming S3 works.
 */
@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
