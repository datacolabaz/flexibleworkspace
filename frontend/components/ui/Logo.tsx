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
 *  - "auto"      full horizontal lockup, theme-aware (default) — light
 *                and dark SVGs both render; globals.css's three-state
 *                rule (mirroring tokens.css) decides which is visible.
 *  - "light"     force the light-background lockup
 *  - "dark"      force the dark-background lockup
 *  - "mono"      force the single-ink lockup (light bg)
 *  - "icon"      icon-only mark, theme-aware
 *  - "icon-light" / "icon-dark"   force one icon-only variant
 */
type LogoVariant = 'auto' | 'light' | 'dark' | 'mono' | 'icon' | 'icon-light' | 'icon-dark';

const LOCKUP_ASPECT = 381.33 / 96; // matches the shipped viewBox — keeps height accurate at any width
const ICON_ASPECT = 62 / 92;

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
  const aspect = isIcon ? ICON_ASPECT : LOCKUP_ASPECT;
  const width = Math.round(height * aspect);

  if (variant === 'auto' || variant === 'icon') {
    const lightSrc = isIcon ? '/brand/icon-mark.svg' : '/brand/logo-horizontal-light.svg';
    const darkSrc = isIcon ? '/brand/icon-mark-on-dark.svg' : '/brand/logo-horizontal-dark.svg';
    return (
      <span className={className} role="img" aria-label={ariaLabel}>
        <img src={lightSrc} alt="" width={width} height={height} className="spotva-logo-light" />
        <img src={darkSrc} alt="" width={width} height={height} className="spotva-logo-dark" />
      </span>
    );
  }

  const srcByVariant: Record<Exclude<LogoVariant, 'auto' | 'icon'>, string> = {
    light: '/brand/logo-horizontal-light.svg',
    dark: '/brand/logo-horizontal-dark.svg',
    mono: '/brand/logo-horizontal-mono.svg',
    'icon-light': '/brand/icon-mark.svg',
    'icon-dark': '/brand/icon-mark-on-dark.svg',
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
