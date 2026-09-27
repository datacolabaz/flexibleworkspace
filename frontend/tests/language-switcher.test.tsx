import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { LanguageSwitcher } from '@/components/features/navigation/LanguageSwitcher';

const replaceMock = vi.fn();
vi.mock('@/lib/i18n/navigation', () => ({
  usePathname: () => '/login',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderSwitcher() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
}

function languageSelect() {
  return screen.getByRole('combobox', { name: /Language/ }) as HTMLSelectElement;
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it('lists only az, en and ru as uppercase short labels, with full names on aria-label', () => {
    renderSwitcher();
    const select = languageSelect();
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toEqual(['AZ', 'EN', 'RU']);
    expect(select.options[0]).toHaveAttribute('aria-label', 'Azərbaycanca');
    expect(select.options[1]).toHaveAttribute('aria-label', 'English');
    expect(select.options[2]).toHaveAttribute('aria-label', 'Русский');
  });

  it('defaults to the current locale as the selected option', () => {
    renderSwitcher();
    expect(languageSelect().value).toBe('en');
  });

  it('switches locale on change while staying on the same page', () => {
    renderSwitcher();
    fireEvent.change(languageSelect(), { target: { value: 'ru' } });
    expect(replaceMock).toHaveBeenCalledWith('/login', { locale: 'ru' });
  });

  it('keeps short codes fully visible: min-width for 2–3 letters plus chevron, no clipping', () => {
    renderSwitcher();
    const select = languageSelect();
    expect(select.className).toMatch(/min-w-\[4\.25rem\]/);
    expect(select.className).toMatch(/max-w-\[4\.25rem\]/);
    expect(select.className).toMatch(/!text-sm/);
    expect(select.className).not.toMatch(/\btruncate\b/);
    expect(select.className).not.toMatch(/overflow-hidden/);
    expect(select.className).not.toMatch(/sm:max-w-\[8\.5rem\]/);
  });
});
