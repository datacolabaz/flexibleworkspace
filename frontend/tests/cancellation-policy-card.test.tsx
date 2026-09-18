import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { CancellationPolicyCard } from '@/components/features/rooms/CancellationPolicyCard';

function renderCard(cancellationPolicy: Record<string, unknown> | null | undefined) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CancellationPolicyCard cancellationPolicy={cancellationPolicy} />
    </NextIntlClientProvider>,
  );
}

describe('CancellationPolicyCard', () => {
  it('defaults to a 24h free-cancellation window and no refund after, matching RefundsService.computeRefundPercentage', () => {
    renderCard(null);
    expect(screen.getByText('Free cancellation up to 24 hours before the booking starts.')).toBeInTheDocument();
    expect(screen.getByText('No refund after that.')).toBeInTheDocument();
  });

  it('honors an explicit free_until_hours', () => {
    renderCard({ free_until_hours: 48 });
    expect(screen.getByText('Free cancellation up to 48 hours before the booking starts.')).toBeInTheDocument();
  });

  it('shows the partial refund percentage when the room sets one', () => {
    renderCard({ free_until_hours: 24, partial_refund_pct: 50 });
    expect(screen.getByText('50% refund after that.')).toBeInTheDocument();
    expect(screen.queryByText('No refund after that.')).not.toBeInTheDocument();
  });
});
