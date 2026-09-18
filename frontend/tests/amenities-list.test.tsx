import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { AmenitiesList } from '@/components/features/rooms/AmenitiesList';

function renderList(amenities: string[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AmenitiesList amenities={amenities} />
    </NextIntlClientProvider>,
  );
}

describe('AmenitiesList', () => {
  it('renders a translated label and icon for each known amenity', () => {
    renderList(['amenity.wifi', 'amenity.parking']);
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument();
    expect(screen.getByText('Parking')).toBeInTheDocument();
  });

  it('falls back to the raw translation key for an amenity not in the taxonomy (drift-tolerant)', () => {
    renderList(['amenity.some_future_thing']);
    expect(screen.getByText('amenity.some_future_thing')).toBeInTheDocument();
  });

  it('shows an empty-state message when the room has no amenities', () => {
    renderList([]);
    expect(screen.getByText('No amenities listed for this space.')).toBeInTheDocument();
  });
});
