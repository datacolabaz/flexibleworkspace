'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { IconButton } from '@/components/ui/IconButton';

const THEME_COOKIE = 'spotva_theme';
const THEME_STORAGE_KEY = 'spotva-theme';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type Theme = 'light' | 'dark';

function resolvedIsDark(): boolean {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing / storage blocked — the cookie below still makes
    // the choice stick for this origin.
  }
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/**
 * The header's two-state theme toggle (08_DESIGN_SYSTEM.md §8.5: "a
 * button, not a settings-page-only control"). The ☀️/🌙 glyph it shows is
 * pure CSS — both are always in the DOM, and the exact three-state
 * selector set app/globals.css already uses for <Logo variant="auto">
 * (bare :root / prefers-color-scheme / [data-theme]) decides which is
 * visible, so the icon is correct on first paint with no client JS and
 * updates live if the OS theme changes mid-session, with nothing to wire
 * up here. This component only needs to *change* the theme on click.
 */
export function ThemeToggle() {
  const t = useTranslations('nav');

  // Reconciles a rare edge case: localStorage survived but the cookie
  // (what SSR reads for the first-paint `data-theme`, see
  // app/[locale]/layout.tsx) didn't — e.g. cookies were cleared but
  // localStorage wasn't. Runs once on mount; the common case (both agree,
  // or neither is set) is a no-op.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      return;
    }
    if ((stored === 'light' || stored === 'dark') && document.documentElement.getAttribute('data-theme') !== stored) {
      applyTheme(stored);
    }
  }, []);

  function handleClick() {
    applyTheme(resolvedIsDark() ? 'light' : 'dark');
  }

  return (
    <IconButton aria-label={t('toggleTheme')} onClick={handleClick}>
      <span aria-hidden="true" className="theme-toggle-icon-light text-lg leading-none">
        ☀️
      </span>
      <span aria-hidden="true" className="theme-toggle-icon-dark text-lg leading-none">
        🌙
      </span>
    </IconButton>
  );
}
