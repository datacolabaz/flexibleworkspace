'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedLegalName = legalName.trim();
    const trimmedDisplayName = displayName.trim();
    if (!trimmedLegalName || !trimmedDisplayName) {
      setError(t('requiredFieldsError'));
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

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {isSubmitting ? t('submittingButton') : t('submitButton')}
      </Button>
    </form>
  );
}
