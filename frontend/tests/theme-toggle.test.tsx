import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { ThemeToggle } from '@/components/features/navigation/ThemeToggle';

function mockMatchMedia(prefersDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function renderToggle() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ThemeToggle />
    </NextIntlClientProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.cookie = 'spotva_theme=; path=/; max-age=0';
    localStorage.clear();
    mockMatchMedia(false); // system default: light
  });

  it('has an accessible name (07_UX_ARCHITECTURE.md §7.7: icon-only controls need one)', () => {
    renderToggle();
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });

  it('switches to dark from a light (system) start, and persists the choice to both localStorage and the SSR cookie', () => {
    renderToggle();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('spotva-theme')).toBe('dark');
    expect(document.cookie).toContain('spotva_theme=dark');
  });

  it('toggles back to light on a second click', () => {
    renderToggle();
    const button = screen.getByRole('button', { name: 'Toggle theme' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reads the *resolved* theme, not just the setting — an explicit dark override beats a light system preference', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    renderToggle();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    // Clicking from an already-dark state should flip to light.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reconciles from localStorage on mount when the SSR cookie is missing but a prior choice is stored', () => {
    localStorage.setItem('spotva-theme', 'dark');
    renderToggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
