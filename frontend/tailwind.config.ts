import type { Config } from 'tailwindcss';

/**
 * Maps Tailwind's theme onto the CSS custom properties in styles/tokens.css
 * (itself a copy of the approved docs/brand/design-tokens.css) — one source
 * of truth, two consumption points, per FRONTEND_IMPLEMENTATION_PLAN.md §5.
 * No hex values are duplicated here; if a color is missing, add the token
 * to tokens.css first, then reference it here — never the reverse.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-bg-surface)',
        'surface-elevated': 'var(--color-bg-surface-elevated)',
        border: {
          DEFAULT: 'var(--color-border-default)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          on: 'var(--color-primary-on)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          active: 'var(--color-accent-active)',
          on: 'var(--color-accent-on)',
          'active-on': 'var(--color-accent-active-on)',
        },
        success: { DEFAULT: 'var(--color-success)', bg: 'var(--color-success-bg)' },
        warning: { DEFAULT: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
        error: { DEFAULT: 'var(--color-error)', bg: 'var(--color-error-bg)' },
        info: { DEFAULT: 'var(--color-info)', bg: 'var(--color-info-bg)' },
        verified: { DEFAULT: 'var(--color-verified)', bg: 'var(--color-verified-bg)' },
        // Oil Green / Amber primitives, for the rare case a component needs
        // the raw scale rather than a semantic role (e.g. a chart, the
        // <Logo> component itself). Prefer the semantic tokens above.
        oil: {
          50: 'var(--spotva-oil-50)',
          100: 'var(--spotva-oil-100)',
          300: 'var(--spotva-oil-300)',
          500: 'var(--spotva-oil-500)',
          700: 'var(--spotva-oil-700)',
          900: 'var(--spotva-oil-900)',
        },
        amber: {
          100: 'var(--spotva-amber-100)',
          400: 'var(--spotva-amber-400)',
          600: 'var(--spotva-amber-600)',
          700: 'var(--spotva-amber-700)',
          900: 'var(--spotva-amber-900)',
        },
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
      },
      fontSize: {
        h1: ['var(--text-h1-size)', { lineHeight: 'var(--text-h1-line)', fontWeight: 'var(--text-h1-weight)' }],
        h2: ['var(--text-h2-size)', { lineHeight: 'var(--text-h2-line)', fontWeight: 'var(--text-h2-weight)' }],
        h3: ['var(--text-h3-size)', { lineHeight: 'var(--text-h3-line)', fontWeight: 'var(--text-h3-weight)' }],
        h4: ['var(--text-h4-size)', { lineHeight: 'var(--text-h4-line)', fontWeight: 'var(--text-h4-weight)' }],
        body: ['var(--text-body-size)', { lineHeight: 'var(--text-body-line)', fontWeight: 'var(--text-body-weight)' }],
        small: ['var(--text-small-size)', { lineHeight: 'var(--text-small-line)', fontWeight: 'var(--text-small-weight)' }],
        label: ['var(--text-label-size)', { lineHeight: 'var(--text-label-line)', fontWeight: 'var(--text-label-weight)' }],
        nav: ['var(--text-nav-size)', { lineHeight: 'var(--text-nav-line)', fontWeight: 'var(--text-nav-weight)' }],
        caption: ['var(--text-caption-size)', { lineHeight: 'var(--text-caption-line)', fontWeight: 'var(--text-caption-weight)' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};

export default config;
