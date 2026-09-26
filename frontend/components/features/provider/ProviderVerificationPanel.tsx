'use client';

import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import type { MyProvider, MyProviderVerificationDocumentType } from '@/lib/api-client/provider-dashboard';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

const STATUS_LABEL: Record<MyProvider['verificationStatus'], string> = {
  PENDING: 'Gözləyir',
  VERIFIED: 'Təsdiqlənib',
  REJECTED: 'Rədd edilib',
  SUSPENDED: 'Dayandırılıb',
};

const STATUS_TONE: Record<MyProvider['verificationStatus'], string> = {
  PENDING: 'bg-warning-bg text-warning',
  VERIFIED: 'bg-success-bg text-success',
  REJECTED: 'bg-error-bg text-error',
  SUSPENDED: 'bg-error-bg text-error',
};

const DOCUMENT_TYPE_LABEL: Record<MyProviderVerificationDocumentType, string> = {
  ID_DOCUMENT: 'Şəxsiyyət vəsiqəsi',
  BUSINESS_REGISTRATION: 'Qeydiyyat şəhadətnaməsi',
  ADDRESS_PROOF: 'Ünvan sənədi',
  OTHER: 'Digər sənəd',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('az-AZ', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ProviderVerificationPanel({ initialProvider }: { initialProvider: MyProvider }) {
  const [provider, setProvider] = useState(initialProvider);

  const [documentType, setDocumentType] = useState<MyProviderVerificationDocumentType>('ID_DOCUMENT');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [uploadSuccess, setUploadSuccess] = useState(false);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setUploadError('Sənəd faylı seçin.');
      return;
    }
    setIsUploading(true);
    setUploadError(undefined);
    setUploadSuccess(false);
    try {
      const formData = new FormData();
      formData.set('documentType', documentType);
      formData.set('file', file);
      const response = await fetch('/api/provider/me/verification-documents', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        // Backend rejects a document whose exact bytes are already on
        // file for a different account (fraud check, 2026-09-23).
        setUploadError(
          body?.error?.code === 'DUPLICATE_DOCUMENT'
            ? 'Bu sənəd artıq başqa hesabda qeydiyyatdan keçib.'
            : (body?.error?.message ?? 'Sənəd yüklənmədi. Yenidən cəhd edin.'),
        );
        return;
      }
      const updated = (await response.json()) as MyProvider;
      setProvider(updated);
      setUploadSuccess(true);
      setFile(null);
      const fileInput = document.getElementById('verification-document-file') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    } catch {
      setUploadError('Sənəd yüklənmədi. Yenidən cəhd edin.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-label text-text-secondary">{provider.legalName}</p>
            <h2 className="font-display text-h3 text-text-primary">{provider.displayName}</h2>
          </div>
          <span className={`rounded-full px-3 py-1 text-caption ${STATUS_TONE[provider.verificationStatus]}`}>
            {STATUS_LABEL[provider.verificationStatus]}
          </span>
        </div>
        {provider.verificationStatus === 'PENDING' && (
          <p className="text-small text-text-secondary">
            Hesabınız yoxlanılır. Tələb olunan sənədləri yükləyin — komandamız onları nəzərdən keçirəcək.
          </p>
        )}
        {provider.verificationStatus === 'REJECTED' && (
          <p className="text-small text-error">
            Müraciətiniz rədd edilib. Zəhmət olmasa sənədləri yenidən yoxlayıb yenidən yükləyin, ya da bizimlə
            əlaqə saxlayın.
          </p>
        )}
        {provider.verificationStatus === 'SUSPENDED' && (
          <p className="text-small text-error">Hesabınız müvəqqəti dayandırılıb. Ətraflı məlumat üçün bizimlə əlaqə saxlayın.</p>
        )}
        {provider.verificationStatus === 'VERIFIED' && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-small text-success">Hesabınız təsdiqlənib.</p>
            {/* Verification alone doesn't get a listing live — the room
                section further down the same page (#provider-rooms) is
                the actual next step, and nothing on the page pointed
                there before this, so a freshly verified provider had no
                way to tell where to go next. */}
            <a
              href="#provider-rooms"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-5 text-label font-semibold text-accent-on transition-colors hover:bg-accent-hover"
            >
              Otaqlarım bölməsinə keçin →
            </a>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <h3 className="font-display text-h4 text-text-primary">Doğrulama sənədləri</h3>
        <p className="text-small text-text-secondary">
          Şəxsiyyət vəsiqəsi, qeydiyyat şəhadətnaməsi və ya ünvanı təsdiqləyən sənəd yükləyin. Bu sənədlər yalnız
          Spotva admin komandası tərəfindən görünür.
        </p>

        {provider.verificationDocuments.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-small text-text-secondary">
            {provider.verificationDocuments.map((doc) => (
              <li key={doc.storageKey} className="flex flex-wrap items-baseline gap-2">
                <span className="text-text-primary">{DOCUMENT_TYPE_LABEL[doc.type]}:</span>
                <span>{doc.originalFilename}</span>
                <span className="text-caption text-text-muted">({formatDate(doc.uploadedAt)})</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleUpload} noValidate className="flex flex-col gap-4 sm:max-w-sm">
          {uploadError && <Alert variant="error">{uploadError}</Alert>}
          {uploadSuccess && <Alert variant="success">Sənəd yükləndi.</Alert>}
          <FormField id="verification-document-type" label="Sənəd növü">
            <Select
              id="verification-document-type"
              name="documentType"
              value={documentType}
              disabled={isUploading}
              onChange={(event) => setDocumentType(event.target.value as MyProviderVerificationDocumentType)}
            >
              <option value="ID_DOCUMENT">{DOCUMENT_TYPE_LABEL.ID_DOCUMENT}</option>
              <option value="BUSINESS_REGISTRATION">{DOCUMENT_TYPE_LABEL.BUSINESS_REGISTRATION}</option>
              <option value="ADDRESS_PROOF">{DOCUMENT_TYPE_LABEL.ADDRESS_PROOF}</option>
              <option value="OTHER">{DOCUMENT_TYPE_LABEL.OTHER}</option>
            </Select>
          </FormField>
          <FormField id="verification-document-file" label="Fayl">
            <input
              id="verification-document-file"
              name="file"
              type="file"
              accept="image/*,application/pdf"
              disabled={isUploading}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-label file:text-accent-on"
            />
          </FormField>
          <Button type="submit" isLoading={isUploading} className="self-start">
            {isUploading ? 'Yüklənir…' : 'Yüklə'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
