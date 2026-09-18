import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { SearchFilters } from '@/components/features/search/SearchFilters';

const replaceMock = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/i18n/navigation', () => ({
  usePathname: () => '/search',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderFilters() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SearchFilters />
    </NextIntlClientProvider>,
  );
}

describe('SearchFilters', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it('seeds the desktop form from the current URL', () => {
    mockSearchParams = new URLSearchParams('city=Baku&sort=price');
    renderFilters();
    expect(screen.getByLabelText('City')).toHaveValue('Baku');
    expect(screen.getByLabelText('Sort by')).toHaveValue('price');
  });

  it('does not touch the URL until Apply is pressed (typing alone never refetches)', () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Ganja' } });
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('applies the desktop draft as a query string on Apply, carrying over untouched fields', () => {
    mockSearchParams = new URLSearchParams('sort=price');
    renderFilters();
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Ganja' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [url] = replaceMock.mock.calls[0];
    expect(url).toContain('/search?');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('city')).toBe('Ganja');
    expect(params.get('sort')).toBe('price');
  });

  it('converts priceMax from whole-unit input to minor units (qəpik) in the query string', () => {
    renderFilters();
    fireEvent.change(screen.getByLabelText('Max price per hour'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    const [url] = replaceMock.mock.calls[0];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('priceMax')).toBe('5000');
  });

  it('Clear all resets to the bare pathname, dropping every filter', () => {
    mockSearchParams = new URLSearchParams('city=Baku&priceMax=5000');
    renderFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(replaceMock).toHaveBeenCalledWith('/search');
  });

  it('shows an active-filter count badge on the mobile Filters button', () => {
    mockSearchParams = new URLSearchParams('city=Baku&participants=4');
    renderFilters();
    const filterButtons = screen.getAllByRole('button', { name: /Filters/ });
    expect(filterButtons.some((btn) => btn.textContent?.includes('2'))).toBe(true);
  });
});
