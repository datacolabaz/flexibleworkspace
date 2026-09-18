import type { ReactNode } from 'react';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

// bg-{variant}-bg / text-{variant} are already a paired, contrast-checked
// set per docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md §15 (styles/
// tokens.css's --color-error/--color-error-bg and its siblings) — no
// opacity modifiers here, since these are CSS-custom-property tokens
// (`var(--color-error)`), and Tailwind's `/opacity` shorthand can't
// compute an alpha channel for a value it can't introspect at build time.
const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'border-error bg-error-bg text-error',
  success: 'border-success bg-success-bg text-success',
  warning: 'border-warning bg-warning-bg text-warning',
  info: 'border-info bg-info-bg text-info',
};

const ICON_BY_VARIANT: Record<AlertVariant, string> = {
  error: '⚠',
  success: '✓',
  warning: '⚠',
  info: 'ℹ',
};

/**
 * A status banner for async outcomes — form-level errors, resend
 * confirmations, rate-limit notices. `error`/`warning` use `role="alert"`
 * (implicit `aria-live="assertive"`) since those need to interrupt;
 * `success`/`info` use `role="status"` (`aria-live="polite"`) so they're
 * announced without stealing focus from what the person is doing
 * (07_UX_ARCHITECTURE.md §7.7 — aria-live regions for async state
 * changes).
 */
export function Alert({
  variant = 'info',
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  const isUrgent = variant === 'error' || variant === 'warning';
  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      className={[
        'flex items-start gap-2.5 rounded-md border-l-4 px-4 py-3 text-small',
        VARIANT_CLASSES[variant],
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <span aria-hidden="true" className="mt-0.5 leading-none">
        {ICON_BY_VARIANT[variant]}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}
