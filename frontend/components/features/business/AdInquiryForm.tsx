'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

/**
 * `/advertise`'s order-request form — the piece that was missing between
 * "here are our ad sizes/prices" and an actual advertiser being able to
 * do anything about it. Posts to `POST /api/ads/inquiries`, a public
 * unauthenticated BFF route that forwards to the backend's
 * `POST ads/inquiries` (rate-limited `@Throttle`, `AdsPublicController`),
 * which writes an `AdInquiryEntity` row. No email/SMS is sent — an admin
 * reads submissions from the "Sorğular" inbox added to
 * `AdvertisingSection.tsx` under Admin → Advertising and follows up with
 * the advertiser directly (phone/email is exactly what this form
 * collects). This mirrors `ListYourSpaceForm.tsx`'s BFF-proxy pattern,
 * minus the file upload — a creative/logo is exchanged over whatever
 * channel the admin reaches out on, once contact is made, not attached
 * here.
 */
export function AdInquiryForm() {
  const t = useTranslations('advertisePage.inquiryForm');

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = contactName.trim();
    const trimmedPhone = contactPhone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError(t('requiredFieldsError'));
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch('/api/ads/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: trimmedName,
          contactPhone: trimmedPhone,
          contactEmail: contactEmail.trim() || undefined,
          companyName: companyName.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(t('genericError'));
        setIsSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('genericError'));
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="flex flex-col gap-1.5 p-6 sm:p-8">
        <h3 className="font-display text-h3 text-text-primary">{t('successTitle')}</h3>
        <p className="text-small text-text-secondary">{t('successBody')}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-6 sm:p-8">
      <div>
        <h3 className="font-display text-h3 text-text-primary">{t('title')}</h3>
        <p className="mt-1.5 text-small text-text-secondary">{t('subtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        <FormField id="ad-inquiry-name" label={t('nameLabel')}>
          <Input
            id="ad-inquiry-name"
            name="contactName"
            type="text"
            required
            value={contactName}
            disabled={isSubmitting}
            onChange={(event) => setContactName(event.target.value)}
          />
        </FormField>

        <FormField id="ad-inquiry-phone" label={t('phoneLabel')} hint={t('phoneHint')}>
          <Input
            id="ad-inquiry-phone"
            name="contactPhone"
            type="tel"
            required
            value={contactPhone}
            disabled={isSubmitting}
            aria-describedby={fieldDescribedBy('ad-inquiry-phone', { hint: t('phoneHint') })}
            onChange={(event) => setContactPhone(event.target.value)}
          />
        </FormField>

        <FormField id="ad-inquiry-email" label={t('emailLabel')} hint={t('optionalHint')}>
          <Input
            id="ad-inquiry-email"
            name="contactEmail"
            type="email"
            value={contactEmail}
            disabled={isSubmitting}
            aria-describedby={fieldDescribedBy('ad-inquiry-email', { hint: t('optionalHint') })}
            onChange={(event) => setContactEmail(event.target.value)}
          />
        </FormField>

        <FormField id="ad-inquiry-company" label={t('companyLabel')} hint={t('optionalHint')}>
          <Input
            id="ad-inquiry-company"
            name="companyName"
            type="text"
            value={companyName}
            disabled={isSubmitting}
            aria-describedby={fieldDescribedBy('ad-inquiry-company', { hint: t('optionalHint') })}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </FormField>

        <FormField id="ad-inquiry-message" label={t('messageLabel')} hint={t('messageHint')}>
          <textarea
            id="ad-inquiry-message"
            name="message"
            rows={4}
            placeholder={t('messagePlaceholder')}
            value={message}
            disabled={isSubmitting}
            aria-describedby={fieldDescribedBy('ad-inquiry-message', { hint: t('messageHint') })}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full min-h-24 rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>

        <Button type="submit" isLoading={isSubmitting} className="self-start">
          {isSubmitting ? t('submittingButton') : t('submitButton')}
        </Button>
      </form>
    </Card>
  );
}
