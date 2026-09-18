'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { StarRatingInput } from '@/components/ui/StarRating';
import type { Review } from '@/lib/api-client/reviews';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

export interface WriteReviewFormProps {
  bookingId: string;
  onSubmitted: (review: Review) => void;
  onCancel: () => void;
}

/**
 * The inline review-submission form `ReviewableBookingCard` reveals for
 * one specific COMPLETED, not-yet-reviewed booking. Posts to
 * `POST /api/reviews` (the BFF route — this is a Client Component and
 * can't read the session cookie itself, same reasoning as
 * `ProfileForm`'s `PATCH /api/account/profile` call).
 *
 * Rating + text only — `CreateReviewDto.photos` is deliberately left off
 * this form: no photo-upload UI exists anywhere else in the app (grepped
 * across `components/`/`lib/`), and building one just for this form would
 * be inventing a media flow the rest of the product doesn't have. See
 * PHASE4_REPORT.md's `/account/reviews` section.
 */
export function WriteReviewForm({ bookingId, onSubmitted, onCancel }: WriteReviewFormProps) {
  const t = useTranslations('account.reviews');

  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rating < 1) {
      setError(t('ratingRequiredError'));
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, rating, text: text.trim() || undefined }),
      });
      if (!response.ok) {
        let code: string | undefined;
        try {
          code = ((await response.json()) as BffErrorBody).error?.code;
        } catch {
          // no JSON body — fall through to the generic message
        }
        if (code === 'UNAUTHENTICATED') setError(t('signedOutError'));
        else if (code === 'REVIEW_ALREADY_EXISTS') setError(t('alreadyReviewedError'));
        else setError(t('genericError'));
        return;
      }
      const review = (await response.json()) as Review;
      onSubmitted(review);
    } catch {
      setError(t('genericError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const ratingFieldId = `write-review-${bookingId}-rating`;
  const textFieldId = `write-review-${bookingId}-text`;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 border-t border-border pt-4">
      {error && <Alert variant="error">{error}</Alert>}

      <FormField id={ratingFieldId} label={t('ratingFieldLabel')}>
        <StarRatingInput
          id={ratingFieldId}
          name={ratingFieldId}
          value={rating}
          onChange={setRating}
          disabled={isSubmitting}
          label={t('ratingFieldLabel')}
          starLabel={(value) => t('starLabel', { value })}
        />
      </FormField>

      <FormField id={textFieldId} label={t('textFieldLabel')} hint={t('textFieldHint')}>
        <textarea
          id={textFieldId}
          name="text"
          rows={4}
          maxLength={2000}
          disabled={isSubmitting}
          value={text}
          aria-describedby={fieldDescribedBy(textFieldId, { hint: t('textFieldHint') })}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
        />
      </FormField>

      <div className="flex gap-2">
        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('submittingButton') : t('submitButton')}
        </Button>
        <Button type="button" variant="ghost" disabled={isSubmitting} onClick={onCancel}>
          {t('cancelButton')}
        </Button>
      </div>
    </form>
  );
}
