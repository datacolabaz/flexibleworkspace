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

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it('lists all six locales, each in its own language rather than the current UI language', () => {
    renderSwitcher();
    const select = screen.getByLabelText('Language') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toEqual(['Azərbaycanca', 'English', 'Русский', 'Türkçe', 'Español', 'Deutsch']);
  });

  it('defaults to the current locale as the selected option', () => {
    renderSwitcher();
    const select = screen.getByLabelText('Language') as HTMLSelectElement;
    expect(select.value).toBe('en');
  });

  it('switches locale on change while staying on the same page', () => {
    renderSwitcher();
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ru' } });
    expect(replaceMock).toHaveBeenCalledWith('/login', { locale: 'ru' });
  });
});
