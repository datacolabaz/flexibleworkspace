import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageProvider, StoredFile } from './storage-provider.interface';

/**
 * V1 default storage driver — writes to local disk under a configured base
 * path. Adequate for a single-instance PaaS deployment (22_INFRASTRUCTURE.md
 * §22.2) and for local development; a managed-disk/CDN driver (S3-compatible)
 * is the natural swap when horizontal scaling is actually needed (§22.6's
 * named trigger conditions), and is a new class behind this same interface,
 * not a rewrite of calling code.
 *
 * `basePath`/`publicBase` are passed in explicitly (rather than this class
 * reading ConfigService itself) so StorageModule can construct two separate
 * instances from one class: a PUBLIC one (room photos — served by the app's
 * static file middleware, `publicUrlFor` returns a real path) and a PRIVATE
 * one (provider verification documents — `publicBase: null`, `publicUrlFor`
 * returns '' since these are never statically served; they're only ever
 * read back via `getBuffer` from an admin-only, authenticated endpoint).
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly basePath: string,
    private readonly publicBase: string | null,
  ) {}

  async put(
    buffer: Buffer,
    originalFilename: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- part of the StorageProvider interface; local disk storage doesn't need the mime type, an S3-backed implementation would.
    mimeType: string,
  ): Promise<StoredFile> {
    await fs.mkdir(this.basePath, { recursive: true });
    const ext = path.extname(originalFilename) || '';
    const storageKey = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.basePath, storageKey), buffer);
    return { storageKey, publicUrl: this.publicUrlFor(storageKey) };
  }

  publicUrlFor(storageKey: string): string {
    if (!this.publicBase) return '';
    return `${this.publicBase}/${storageKey}`;
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    // storageKey is always our own crypto.randomUUID()-derived value (never
    // caller-supplied path text), so this can't be used for path traversal.
    return fs.readFile(path.join(this.basePath, storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await fs.rm(path.join(this.basePath, storageKey), { force: true });
  }
}
