import type { HTMLAttributes } from 'react';

export type BadgeVariant = 'verified' | 'neutral' | 'accent' | 'success' | 'warning' | 'error';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

// 08_DESIGN_SYSTEM.md §8.2: "Verified badge visually distinct and
// consistent everywhere it appears (search card, room detail, provider
// profile)" — built once here rather than per-screen. `border-l-4` isn't
// right for a small pill the way it is for <Alert>, so this uses a solid
// token-backed fill instead (still no opacity modifier on a CSS-var
// color — see Alert.tsx's own note on why that doesn't work).
//
// `success`/`warning`/`error` added for the /account/bookings status
// badge (CONFIRMED/COMPLETED vs PENDING/PAYMENT_PENDING vs CANCELLED/
// EXPIRED/etc.) — the same `--color-success`/`--color-warning`/
// `--color-error` tokens `Alert.tsx` already uses, just as a badge fill
// rather than a banner, so booking status reads the same semantic color
// everywhere it appears rather than each screen picking its own.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  verified: 'bg-verified-bg text-verified',
  neutral: 'bg-surface-elevated text-text-secondary',
  accent: 'bg-accent text-accent-on',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  error: 'bg-error-bg text-error',
};

export function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-semibold',
        VARIANT_CLASSES[variant],
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    >
      {children}
    </span>
  );
}
