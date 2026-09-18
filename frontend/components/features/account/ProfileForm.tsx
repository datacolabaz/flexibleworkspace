'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { routing, LOCALE_LABELS } from '@/lib/i18n/routing';
import type { Profile } from '@/lib/api-client/account';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

export interface ProfileFormProps {
  initialProfile: Profile;
}

/**
 * `/account/profile`'s edit form. Only `displayName`/`locale` are
 * editable — email/phone render as static text with an explanatory note
 * rather than disabled inputs, since "disabled" would suggest they're
 * editable-but-currently-blocked; they're not editable here at all
 * (`UpdateProfileDto`'s own comment: changing an OTP-login identifier
 * needs its own re-verification flow, not built this pass).
 *
 * `locale` here is explicitly the *notification* language
 * (`NotificationsService`/`PaymentsService` read `AppUserEntity.locale`
 * when composing an email/SMS) — a different thing from the site's
 * display language, which the header's `LanguageSwitcher` already
 * controls via the URL. Labeled accordingly so the two controls aren't
 * mistaken for duplicates of each other.
 */
export function ProfileForm({ initialProfile }: ProfileFormProps) {
  const t = useTranslations('account.profile');

  const [displayName, setDisplayName] = useState(initialProfile.displayName ?? '');
  const [locale, setLocale] = useState(initialProfile.locale);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [savedMessage, setSavedMessage] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError(t('displayNameRequired'));
      setSavedMessage(undefined);
      return;
    }

    setIsSaving(true);
    setError(undefined);
    setSavedMessage(undefined);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmed, locale }),
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
      setDisplayName(trimmed);
      setSavedMessage(t('savedMessage'));
    } catch {
      setError(t('genericError'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-md flex-col gap-5">
      {error && <Alert variant="error">{error}</Alert>}
      {savedMessage && <Alert variant="success">{savedMessage}</Alert>}

      <FormField id="profile-display-name" label={t('displayNameLabel')}>
        <Input
          id="profile-display-name"
          name="displayName"
          type="text"
          autoComplete="name"
          value={displayName}
          disabled={isSaving}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </FormField>

      <FormField id="profile-locale" label={t('localeLabel')} hint={t('localeHint')}>
        <Select
          id="profile-locale"
          name="locale"
          value={locale}
          disabled={isSaving}
          aria-describedby={fieldDescribedBy('profile-locale', { hint: t('localeHint') })}
          onChange={(event) => setLocale(event.target.value)}
        >
          {routing.locales.map((loc) => (
            <option key={loc} value={loc}>
              {LOCALE_LABELS[loc]}
            </option>
          ))}
        </Select>
      </FormField>

      <div className="flex flex-col gap-1.5">
        <p className="text-label text-text-primary">{t('emailLabel')}</p>
        <p className="text-body text-text-secondary">{initialProfile.email ?? t('notSet')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-label text-text-primary">{t('phoneLabel')}</p>
        <p className="text-body text-text-secondary">{initialProfile.phone ?? t('notSet')}</p>
      </div>

      <p className="text-small text-text-muted">{t('identityFieldsNote')}</p>

      <Button type="submit" isLoading={isSaving} className="self-start">
        {isSaving ? t('savingButton') : t('saveButton')}
      </Button>
    </form>
  );
}
