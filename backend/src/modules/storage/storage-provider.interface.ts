export interface StoredFile {
  storageKey: string;
  publicUrl: string;
}

/**
 * 22_INFRASTRUCTURE.md §22.7 — object storage/CDN pipeline, behind an
 * adapter so the local V1 driver and a future S3-compatible driver never
 * touch calling code differently (same adapter discipline as PaymentProvider
 * and NotificationChannel).
 */
export interface StorageProvider {
  put(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
  ): Promise<StoredFile>;
  publicUrlFor(storageKey: string): string;
  /**
   * Reads a previously-stored file back into memory. Used by admin-only
   * download endpoints (e.g. provider verification documents) that stream
   * the file through the API rather than via a public static URL.
   */
  getBuffer(storageKey: string): Promise<Buffer>;
}
