/* eslint-disable @next/next/no-img-element -- these are local, pre-sized
   SVG vectors; Next's raster <Image> optimizer adds no value here and
   requires extra next.config allow-listing for SVG sources. */

/**
 * The Spotva mark — always rendered from the shipped SVG masters in
 * public/brand/, never redrawn/recolored inline, per
 * docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md §24 ("use the SVG master
 * and export from it, never redraw or trace per use case").
 *
 * variant:
 *  - "auto"      full horizontal lockup (icon + wordmark), theme-aware
 *                (default) — light and dark SVGs both render;
 *                globals.css's three-state rule (mirroring tokens.css)
 *                decides which is visible.
 *  - "light"     force the light-background full lockup
 *  - "dark"      force the dark-background full lockup
 *  - "mono"      force the single-ink lockup (light bg)
 *  - "icon"      icon-only mark, theme-aware
 *  - "icon-light" / "icon-dark"   force one icon-only variant
 *  - "wordmark"  text-only lockup (no icon mark), theme-aware — the
 *                brand-supplied wordmark master (real embedded Fraunces
 *                Spotva Subset, never a different font), used in the
 *                site navbar per the owner's explicit choice
 *  - "wordmark-light" / "wordmark-dark"   force one wordmark-only variant
 */
type LogoVariant =
  | 'auto'
  | 'light'
  | 'dark'
  | 'mono'
  | 'icon'
  | 'icon-light'
  | 'icon-dark'
  | 'wordmark'
  | 'wordmark-light'
  | 'wordmark-dark';

const LOCKUP_ASPECT = 381.33 / 96; // matches the shipped viewBox — keeps height accurate at any width
const ICON_ASPECT = 62 / 92;
const WORDMARK_ASPECT = 260 / 96; // wordmark-only master's viewBox (~2.71:1, per its own spec)

export function Logo({
  variant = 'auto',
  height = 32,
  className,
  ariaLabel = 'Spotva',
}: {
  variant?: LogoVariant;
  height?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const isIcon = variant.startsWith('icon');
  const isWordmark = variant.startsWith('wordmark');
  const aspect = isIcon ? ICON_ASPECT : isWordmark ? WORDMARK_ASPECT : LOCKUP_ASPECT;
  const width = Math.round(height * aspect);

  if (variant === 'auto' || variant === 'icon' || variant === 'wordmark') {
    const lightSrc = isIcon
      ? '/brand/icon-mark.svg'
      : isWordmark
        ? '/brand/wordmark-on-light.svg'
        : '/brand/logo-horizontal-light.svg';
    const darkSrc = isIcon
      ? '/brand/icon-mark-on-dark.svg'
      : isWordmark
        ? '/brand/wordmark-on-dark.svg'
        : '/brand/logo-horizontal-dark.svg';
    return (
      <span className={className} role="img" aria-label={ariaLabel}>
        <img src={lightSrc} alt="" width={width} height={height} className="spotva-logo-light" />
        <img src={darkSrc} alt="" width={width} height={height} className="spotva-logo-dark" />
      </span>
    );
  }

  const srcByVariant: Record<Exclude<LogoVariant, 'auto' | 'icon' | 'wordmark'>, string> = {
    light: '/brand/logo-horizontal-light.svg',
    dark: '/brand/logo-horizontal-dark.svg',
    mono: '/brand/logo-horizontal-mono.svg',
    'icon-light': '/brand/icon-mark.svg',
    'icon-dark': '/brand/icon-mark-on-dark.svg',
    'wordmark-light': '/brand/wordmark-on-light.svg',
    'wordmark-dark': '/brand/wordmark-on-dark.svg',
  };

  return (
    <img
      src={srcByVariant[variant]}
      alt={ariaLabel}
      width={width}
      height={height}
      className={className}
    />
  );
}
