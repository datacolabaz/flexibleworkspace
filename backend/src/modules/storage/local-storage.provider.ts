import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider, StoredFile } from './storage-provider.interface';

/**
 * V1 default storage driver — writes to local disk under STORAGE_LOCAL_PATH.
 * Adequate for a single-instance PaaS deployment (22_INFRASTRUCTURE.md §22.2)
 * and for local development; a managed-disk/CDN driver (S3-compatible) is
 * the natural swap when horizontal scaling is actually needed (§22.6's named
 * trigger conditions), and is a new class behind this same interface, not a
 * rewrite of calling code. `publicUrlFor` returns a path served by the app's
 * own static file middleware in dev — production would front this with a CDN.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;
  private readonly publicBase: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath =
      this.configService.get<string>('storage.localPath') ?? './uploads';
    this.publicBase = '/uploads';
  }

  async put(
    buffer: Buffer,
    originalFilename: string,
    _mimeType: string,
  ): Promise<StoredFile> {
    await fs.mkdir(this.basePath, { recursive: true });
    const ext = path.extname(originalFilename) || '';
    const storageKey = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.basePath, storageKey), buffer);
    return { storageKey, publicUrl: this.publicUrlFor(storageKey) };
  }

  publicUrlFor(storageKey: string): string {
    return `${this.publicBase}/${storageKey}`;
  }
}
