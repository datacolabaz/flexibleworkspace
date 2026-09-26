'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface CoverImageUploadProps {
  /** UUID of the event draft — required for server-side upload. When null, upload is disabled and only the URL fallback is shown. */
  eventId: string | null;
  /** Currently saved cover image URL (from form state or a previous upload). */
  value: string;
  /** Called when the resolved URL changes (uploaded URL or manual URL input). */
  onChange: (url: string) => void;
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * Feature 2 — Cover image upload for the event creation wizard.
 *
 * Renders:
 *  1. A drop-zone / file picker for JPEG, PNG, WebP up to 5 MB.
 *  2. An image preview with [Dəyişdir] / [Sil] once a file is chosen.
 *  3. A secondary URL text input as a fallback / manual override.
 *
 * The upload hits the BFF `POST /api/events/:eventId/cover` which proxies
 * to the NestJS backend. On success, the returned `coverImage` URL is
 * forwarded to the parent wizard state via `onChange`.
 */
export function CoverImageUpload({ eventId, value, onChange }: CoverImageUploadProps) {
  const t = useTranslations('eventCreate');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Derived: the URL currently shown as the cover (upload result > manual input)
  const displayUrl = previewUrl ?? value;

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

    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Upload if we have an event draft
    if (eventId) {
      uploadFile(file, objectUrl);
    }
  }

  async function uploadFile(file: File, localPreview: string) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('cover', file);
      const res = await fetch(`/api/events/${eventId}/cover`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json() as { coverImage?: string; error?: { message: string } };
      if (!res.ok) throw new Error(data?.error?.message ?? t('coverUploadError'));
      if (data.coverImage) {
        onChange(data.coverImage);
        // Keep the local blob URL as preview until the page navigates
      }
    } catch (err) {
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
        <div className="relative overflow-hidden rounded-md border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt=""
            className="h-48 w-full object-cover"
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
