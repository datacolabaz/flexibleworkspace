'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface CoverImageUploadProps {
  /** UUID of the event draft — required for server-side upload.
   *  When null, the selected file is held locally and uploaded automatically
   *  the moment this prop changes to a non-null value (i.e. once the wizard
   *  creates the draft on step 2 advance). */
  eventId: string | null;
  /** Currently saved cover image URL (from form state or a previous upload). */
  value: string;
  /** Called when the resolved URL changes (uploaded URL or manual URL input). */
  onChange: (url: string) => void;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB

// ── Image optimisation (Canvas API — no extra deps) ──────────────────────

/**
 * Resize + compress the file client-side before upload:
 *  - Max 1280 × 720 px  (16:9 cover proportions)
 *  - Quality 0.85 WebP (falls back to original if toBlob fails)
 * Returns the original File untouched when the image is already small enough.
 */
async function optimizeImage(file: File): Promise<File> {
  const MAX_WIDTH = 1280;
  const MAX_HEIGHT = 720;
  const QUALITY = 0.85;
  const OUTPUT_TYPE = 'image/webp';

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Already within limits → skip re-encoding
      if (width <= MAX_WIDTH && height <= MAX_HEIGHT) {
        resolve(file);
        return;
      }

      const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(
              new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
                type: OUTPUT_TYPE,
              }),
            );
          } else {
            resolve(file); // toBlob failed — send original
          }
        },
        OUTPUT_TYPE,
        QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // can't decode — send original
    };
    img.src = url;
  });
}

// ── Component ─────────────────────────────────────────────────────────────

/**
 * Feature 2 — Cover image upload for the event creation wizard.
 *
 * Renders:
 *  1. A drop-zone / file picker for JPEG, PNG, WebP up to 5 MB.
 *  2. A 16:9 preview with [Dəyişdir] / [Sil] buttons once a file is chosen.
 *  3. A secondary URL text input as a fallback / manual override.
 *
 * Upload flow:
 *  - If `eventId` is available → upload immediately on file selection.
 *  - If `eventId` is null (no draft yet) → show local preview and queue the
 *    file.  The upload fires automatically when `eventId` first becomes
 *    non-null (wizard creates draft on step 1 → step 2 advance).
 *
 * On success the returned `coverImage` URL is forwarded to the parent wizard
 * state via `onChange`.
 */
export function CoverImageUpload({ eventId, value, onChange }: CoverImageUploadProps) {
  const t = useTranslations('eventCreate');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /**
   * Holds a file that was selected while `eventId` was null.
   * The ref (not state) avoids spurious re-renders; we only read it inside
   * the `useEffect` that watches `eventId`.
   */
  const pendingRef = useRef<{ file: File; preview: string } | null>(null);

  // Derived: the URL currently shown as the cover (upload result > manual input)
  const displayUrl = previewUrl ?? value;

  // ── Deferred upload: trigger when eventId becomes available ─────────────

  useEffect(() => {
    if (!eventId || !pendingRef.current) return;
    const { file, preview } = pendingRef.current;
    pendingRef.current = null;
    // uploadFile uses `eventId` from closure — safe because this effect
    // only runs after a render in which `eventId` is already non-null.
    uploadFile(file, preview); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // ── File handling ─────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function processFile(file: File) {
    setUploadError(null);

    if (!ALLOWED_MIME.includes(file.type)) {
      setUploadError(t('coverTypeError'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError(t('coverSizeError'));
      return;
    }

    // Revoke the previous blob URL (if any) to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    // Drop any previously queued file
    if (pendingRef.current && pendingRef.current.preview !== previewUrl) {
      URL.revokeObjectURL(pendingRef.current.preview);
    }
    pendingRef.current = null;

    // Show local preview immediately — gives instant feedback
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    if (eventId) {
      // Draft already exists — upload straight away
      uploadFile(file, objectUrl);
    } else {
      // No draft yet — queue for upload once eventId is available
      pendingRef.current = { file, preview: objectUrl };
    }
  }

  async function uploadFile(file: File, localPreview: string) {
    setUploading(true);
    setUploadError(null);
    try {
      // Optimise before sending (resize to ≤ 1280×720, WebP @ 85 %)
      const optimized = await optimizeImage(file);

      const form = new FormData();
      form.append('cover', optimized);

      const res = await fetch(`/api/events/${eventId}/cover`, {
        method: 'POST',
        body: form,
      });

      const data = (await res.json()) as { coverImage?: string; error?: { message: string } };

      if (!res.ok) {
        // Map HTTP status codes to user-friendly Azerbaijani messages
        let msg: string;
        if (res.status === 413) {
          msg = 'Şəkil faylı çox böyükdür. Məks. 5 MB.';
        } else if (res.status === 415) {
          msg = 'Bu fayl formatı dəstəklənmir. JPG, PNG və ya WebP istifadə edin.';
        } else if (res.status === 401) {
          msg = 'Sessiya bitib. Zəhmət olmasa yenidən daxil olun.';
        } else {
          msg = data?.error?.message ?? t('coverUploadError');
        }
        if (process.env.NODE_ENV !== 'production') {
          console.error('[CoverImageUpload] upload failed:', res.status, data);
        }
        throw new Error(msg);
      }

      if (data.coverImage) {
        onChange(data.coverImage);
        // Keep local blob preview until navigation to avoid flicker
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[CoverImageUpload] upload error:', err);
      }
      setUploadError(err instanceof Error ? err.message : t('coverUploadError'));
      // Revert preview on failure
      setPreviewUrl(null);
      URL.revokeObjectURL(localPreview);
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (pendingRef.current) {
      URL.revokeObjectURL(pendingRef.current.preview);
      pendingRef.current = null;
    }
    setPreviewUrl(null);
    onChange('');
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Manual URL is the fallback when no file is uploaded
    if (!previewUrl) {
      onChange(e.target.value);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-label font-semibold text-text-primary">
        {t('coverUploadLabel')}
      </label>

      {/* Preview or drop-zone */}
      {displayUrl ? (
        <div>
          {/* 16:9 preview — matches the event detail page cover banner */}
          <div className="relative w-full aspect-video overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => {
                // Broken URL — clear it silently
                if (!previewUrl) onChange('');
              }}
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div>
            )}
            {!uploading && (
              <div className="absolute bottom-2 right-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md bg-white/90 px-3 py-1 text-caption font-semibold text-text-primary shadow-sm hover:bg-white"
                >
                  {t('coverChangeButton')}
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="rounded-md bg-white/90 px-3 py-1 text-caption font-semibold text-error shadow-sm hover:bg-white"
                >
                  {t('coverRemoveButton')}
                </button>
              </div>
            )}
          </div>
          <p className="mt-1 text-small text-text-muted">
            Tədbir səhifəsində şəkil belə görünəcək
          </p>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-surface p-8 text-center transition-colors hover:bg-surface-elevated"
        >
          <span className="text-3xl">📷</span>
          <p className="text-label font-semibold text-text-primary">{t('coverUploadButton')}</p>
          <p className="text-small text-text-muted">{t('coverUploadHint')}</p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
      />

      {uploadError && (
        <p className="text-small text-error">{uploadError}</p>
      )}

      {/* URL fallback — only shown / editable when no file upload has been done */}
      {!previewUrl && (
        <div>
          <label className="mb-1 block text-small font-semibold text-text-muted">
            {t('coverUploadUrlLabel')}
          </label>
          <input
            type="url"
            value={value}
            onChange={handleUrlChange}
            placeholder="https://…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline focus:outline-2 focus:outline-primary"
          />
        </div>
      )}

      <p className="text-small text-text-muted">{t('coverUploadOptional')}</p>
    </div>
  );
}
