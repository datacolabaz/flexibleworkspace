import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { WriteReviewForm } from '@/components/features/account/WriteReviewForm';
import type { Review } from '@/lib/api-client/reviews';

function renderForm(onSubmitted = vi.fn(), onCancel = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WriteReviewForm bookingId="booking-1" onSubmitted={onSubmitted} onCancel={onCancel} />
    </NextIntlClientProvider>,
  );
  return { onSubmitted, onCancel };
}

describe('WriteReviewForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('rejects submission with no rating selected, without calling the BFF route', () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(screen.getByText('Select a rating.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the selected rating and trimmed text to /api/reviews, and reports the created review', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const createdReview: Review = {
      id: 'review-1',
      bookingId: 'booking-1',
      rating: 4,
      text: 'Nice space',
      moderationStatus: 'APPROVED',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(createdReview), { status: 201 }));

    const { onSubmitted } = renderForm();
    fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
    fireEvent.change(screen.getByLabelText('Your review (optional)'), { target: { value: '  Nice space  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(createdReview));
    expect(fetchMock).toHaveBeenCalledWith('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'booking-1', rating: 4, text: 'Nice space' }),
    });
  });

  it('shows an already-reviewed message on a 409 REVIEW_ALREADY_EXISTS response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'REVIEW_ALREADY_EXISTS' } }), { status: 409 }),
    );

    renderForm();
    fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByText('This booking has already been reviewed.')).toBeInTheDocument();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
