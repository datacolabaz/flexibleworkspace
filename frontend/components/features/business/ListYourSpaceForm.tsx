'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/**
 * `/list-your-space`'s registration form — proxies `POST /providers`
 * through `app/api/providers/route.ts` (a Client Component can't read
 * the session cookie itself, same reasoning as every other BFF-backed
 * form). `legalName`/`displayName` required, `category` optional, the
 * same three fields `CreateProviderDto` actually validates — no extra
 * fields invented for a "fuller-looking" form (no address/phone/etc.:
 * a provider's `Location`s, with their own address, are added later
 * through the not-yet-built provider dashboard, per `09_DOMAIN_MODEL.md`
 * §9.2's Provider/Location split).
 *
 * A provider flagged this form had no way to add a photo at all — the
 * logo/cover photo below is now a REQUIRED second step, validated
 * client-side before submit (owner's decision: every application needs
 * at least one photo, mirroring `ROOM_NO_PHOTOS` gating a room's own
 * activation). `POST /providers` (JSON) creates the provider, then
 * `POST /api/providers/:id/logo` (multipart) uploads the photo that
 * validation already guaranteed is picked. It's a separate request
 * rather than one combined multipart submit because `POST /providers`
 * is the typed, OpenAPI-contracted endpoint (`providers.ts`'s
 * `registerProvider`) — changing its shape would mean updating
 * `29_API_OPENAPI.yaml` and regenerating the generated client, out of
 * scope here. A failed *upload* (network hiccup, etc.) still never blocks
 * registration success once the provider row exists — the application is
 * real either way; `logoFailed` just surfaces that the photo itself needs
 * retrying.
 *
 * On success, shows a confirmation rather than redirecting anywhere —
 * there's no provider dashboard built yet to send them to
 * (`verificationStatus` starts `PENDING`; an admin reviews it, same flow
 * `admin.e2e-spec.ts` already covers on the backend side).
 */
export function ListYourSpaceForm() {
  const t = useTranslations('listYourSpace');

  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(undefined);
    if (!file) {
      setLogoFile(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError(t('logoTypeError'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t('logoSizeError'));
      return;
    }
    setLogoFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLegalName = legalName.trim();
    const trimmedDisplayName = displayName.trim();
    if (!trimmedLegalName || !trimmedDisplayName) {
      setError(t('requiredFieldsError'));
      return;
    }
    if (!logoFile) {
      setError(t('logoRequiredError'));
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: trimmedLegalName,
          displayName: trimmedDisplayName,
          category: category.trim() || undefined,
        }),
      });
      if (!response.ok) {
        let code: string | undefined;
        try {
          code = ((await response.json()) as BffErrorBody).error?.code;
        } catch {
          // no JSON body — fall through to the generic message
        }
        setError(code === 'UNAUTHENTICATED' ? t('signedOutError') : t('genericError'));
        return;
      }

      const provider = (await response.json()) as { id: string };
      if (logoFile) {
        try {
          const formData = new FormData();
          formData.set('logo', logoFile);
          const logoResponse = await fetch(`/api/providers/${provider.id}/logo`, { method: 'POST', body: formData });
          setLogoFailed(!logoResponse.ok);
        } catch {
          setLogoFailed(true);
        }
      }
      setSubmitted(true);
    } catch {
      setError(t('genericError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Alert variant="success">
        <p className="font-semibold">{t('successTitle')}</p>
        <p className="mt-1">{t('successMessage')}</p>
        {logoFailed && <p className="mt-2 text-small">{t('logoUploadFailedNote')}</p>}
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-md flex-col gap-5">
      {error && <Alert variant="error">{error}</Alert>}

      <FormField id="lys-legal-name" label={t('legalNameLabel')} hint={t('legalNameHint')}>
        <Input
          id="lys-legal-name"
          name="legalName"
          type="text"
          value={legalName}
          disabled={isSubmitting}
          aria-describedby={fieldDescribedBy('lys-legal-name', { hint: t('legalNameHint') })}
          onChange={(event) => setLegalName(event.target.value)}
        />
      </FormField>

      <FormField id="lys-display-name" label={t('displayNameLabel')} hint={t('displayNameHint')}>
        <Input
          id="lys-display-name"
          name="displayName"
          type="text"
          value={displayName}
          disabled={isSubmitting}
          aria-describedby={fieldDescribedBy('lys-display-name', { hint: t('displayNameHint') })}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </FormField>

      <FormField id="lys-category" label={t('categoryLabel')} hint={t('categoryHint')}>
        <Input
          id="lys-category"
          name="category"
          type="text"
          value={category}
          disabled={isSubmitting}
          aria-describedby={fieldDescribedBy('lys-category', { hint: t('categoryHint') })}
          onChange={(event) => setCategory(event.target.value)}
        />
      </FormField>

      <FormField id="lys-logo" label={t('logoLabel')} hint={t('logoHint')}>
        <input
          id="lys-logo"
          name="logo"
          type="file"
          accept="image/*"
          disabled={isSubmitting}
          onChange={handleLogoChange}
          aria-describedby={fieldDescribedBy('lys-logo', { hint: t('logoHint') })}
          className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-label file:text-accent-on disabled:cursor-not-allowed disabled:opacity-50"
        />
        {logoFile && <p className="mt-1.5 text-caption text-text-muted">{logoFile.name}</p>}
      </FormField>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {isSubmitting ? t('submittingButton') : t('submitButton')}
      </Button>
    </form>
  );
}
