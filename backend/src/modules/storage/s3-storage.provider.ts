import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageProvider,
  StoredFile,
  PresignedUpload,
} from './storage-provider.interface';

const PRESIGNED_UPLOAD_TTL_SECONDS = 5 * 60;
const PRESIGNED_DOWNLOAD_TTL_SECONDS = 5 * 60;

/**
 * S3-compatible object storage driver (Cloudflare R2 recommended —
 * `region: 'auto'` is R2's convention, matching `configuration.ts`'s
 * default). Same adapter discipline as `LocalStorageProvider`: two
 * instances constructed from this one class (`StorageModule`), one
 * public-read (`publicBaseUrl` set — room photos/videos, provider
 * logos), one with `publicBaseUrl: null` (provider verification
 * documents — that bucket must have no public access configured at
 * the storage provider at all; this class never assumes otherwise).
 *
 * `put()`/`getBuffer()` still exist (small server-side writes/reads
 * — e.g. the existing multipart-upload endpoints callers haven't been
 * migrated off yet) but the primary path for new large media uploads
 * is `createPresignedUpload()`: the file's bytes go straight from the
 * browser to the bucket, never through this Node process
 * (22_INFRASTRUCTURE.md §22.7).
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    private readonly publicBaseUrl: string | null,
    endpoint: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
  ) {
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // R2 (and most S3-compatible providers) need path-style addressing
      // rather than AWS's default virtual-hosted-style bucket subdomains.
      forcePathStyle: true,
    });
  }

  private newStorageKey(originalFilename: string): string {
    const ext = path.extname(originalFilename) || '';
    return `${crypto.randomUUID()}${ext}`;
  }

  async put(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<StoredFile> {
    const storageKey = this.newStorageKey(originalFilename);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return { storageKey, publicUrl: this.publicUrlFor(storageKey) };
  }

  publicUrlFor(storageKey: string): string {
    if (!this.publicBaseUrl) return '';
    return `${this.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`;
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async createPresignedUpload(
    originalFilename: string,
    mimeType: string,
  ): Promise<PresignedUpload> {
    const storageKey = this.newStorageKey(originalFilename);
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        ContentType: mimeType,
      }),
      { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS },
    );
    return { storageKey, uploadUrl, publicUrl: this.publicUrlFor(storageKey) };
  }

  async headSize(storageKey: string): Promise<number> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    return result.ContentLength ?? 0;
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }

  /**
   * A private-bucket equivalent of a "download link" — used by admin
   * document-download routes as an alternative to `getBuffer()` +
   * streaming through this app when a redirect is preferable. Not part
   * of the `StorageProvider` interface (callers that need it use the
   * concrete class), since `LocalStorageProvider` has no equivalent
   * concept of a signed GET.
   */
  async presignedDownloadUrl(storageKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
      { expiresIn: PRESIGNED_DOWNLOAD_TTL_SECONDS },
    );
  }
}
