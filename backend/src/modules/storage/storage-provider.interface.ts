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
export interface PresignedUpload {
  storageKey: string;
  /** Short-lived URL the CLIENT uploads directly to (PUT, body = raw file bytes) — the file's bytes never pass through this app server. */
  uploadUrl: string;
  /** Where the file will be readable once the direct upload completes. */
  publicUrl: string;
}

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
  /**
   * Issues a short-lived, direct-upload URL for the CLIENT to PUT a file
   * to (room photos/videos — 22_INFRASTRUCTURE.md §22.7's "not through
   * the app server" requirement). Optional on the interface: only
   * `S3StorageProvider` implements it — `LocalStorageProvider` has no
   * equivalent (there's nothing for a browser to PUT directly to on a
   * single app server's own disk), so callers must check for its
   * presence and fail clearly when the local driver is active.
   */
  createPresignedUpload?(
    originalFilename: string,
    mimeType: string,
  ): Promise<PresignedUpload>;
  /**
   * Confirms an object was actually uploaded to the given key, and
   * returns its real size — used right after a direct client upload to
   * verify server-side (via a HEAD request, never downloading the
   * bytes) rather than trusting the client's self-reported file size.
   * Throws if the object doesn't exist.
   */
  headSize?(storageKey: string): Promise<number>;
  /**
   * Deletes a stored object — used when a provider removes a room photo
   * or video, and when replacing a room's video, so a removed file
   * doesn't sit around as billed storage forever (23_COST_MODEL.md /
   * "cost optimization": no permanent abandoned uploads).
   */
  delete(storageKey: string): Promise<void>;
}
