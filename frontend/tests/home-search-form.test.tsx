import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { HomeSearchForm } from '@/components/features/search/HomeSearchForm';

const pushMock = vi.fn();

vi.mock('@/lib/i18n/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderSearch() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <HomeSearchForm />
    </NextIntlClientProvider>,
  );
}

describe('HomeSearchForm', () => {
  beforeEach(() => pushMock.mockClear());

  it('starts with the launch city while leaving intent, date and guests optional', () => {
    renderSearch();
    expect(screen.getByLabelText('City')).toHaveValue('Bakı');
    expect(screen.getByLabelText('Activity')).toHaveValue('');
    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByLabelText('Guests')).toHaveValue(null);
  });

  it('hands structured intent to the existing search URL contract', () => {
    renderSearch();
    fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'room_type.event_space' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Baku' } });
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(pushMock).toHaveBeenCalledTimes(1);
    const [url] = pushMock.mock.calls[0] as [string];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/search?')).toBe(true);
    expect(params.get('roomType')).toBe('room_type.event_space');
    expect(params.get('city')).toBe('Baku');
    expect(params.get('date')).toBe('2026-10-10');
    expect(params.get('participants')).toBe('24');
  });
});
