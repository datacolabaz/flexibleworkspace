'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * Sprint 3, Lead Tracking (25_PROVIDER_ARCHITECTURE.md follow-up) — a
 * visitor expresses interest in a room (name/phone/message) without
 * booking or paying. Deliberately separate from `BookingWidget`: this
 * captures a soft lead for the provider to follow up on manually, not a
 * reservation. Per the approved standing decision, no payment gateway is
 * involved anywhere in this flow (payment stays abstracted for Phase 3).
 */
export function LeadCaptureForm({ roomId }: { roomId: string }) {
  const t = useTranslations('room');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerEmail: email.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        setError(body?.error?.message ?? t('leadFormErrorGeneric'));
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('leadFormErrorGeneric'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="flex flex-col gap-1.5 p-5">
        <h3 className="font-display text-h4 text-text-primary">{t('leadFormSuccessTitle')}</h3>
        <p className="text-small text-text-secondary">{t('leadFormSuccessBody')}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">{t('leadFormTitle')}</h3>
        <p className="mt-1 text-small text-text-secondary">{t('leadFormSubtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <FormField id="lead-name" label={t('leadFormNameLabel')}>
          <Input
            id="lead-name"
            name="name"
            type="text"
            required
            value={name}
            disabled={isSubmitting}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField id="lead-phone" label={t('leadFormPhoneLabel')}>
          <Input
            id="lead-phone"
            name="phone"
            type="tel"
            required
            value={phone}
            disabled={isSubmitting}
            onChange={(event) => setPhone(event.target.value)}
          />
        </FormField>
        <FormField id="lead-email" label={t('leadFormEmailLabel')}>
          <Input
            id="lead-email"
            name="email"
            type="email"
            value={email}
            disabled={isSubmitting}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField id="lead-message" label={t('leadFormMessageLabel')}>
          <textarea
            id="lead-message"
            name="message"
            rows={3}
            placeholder={t('leadFormMessagePlaceholder')}
            value={message}
            disabled={isSubmitting}
            onChange={(event) => setMessage(event.target.value)}
            className="w-full min-h-24 rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </FormField>
        <Button type="submit" isLoading={isSubmitting} className="self-start">
          {isSubmitting ? t('leadFormSubmitting') : t('leadFormSubmitCta')}
        </Button>
      </form>
    </Card>
  );
}
