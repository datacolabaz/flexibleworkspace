import type { ComponentProps } from 'react';
import { Link } from '@/lib/i18n/navigation';
import type { ButtonVariant, ButtonSize } from './Button';

export interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Same variant/size class pairs as `Button.tsx`, duplicated rather than
// imported — `Button` computes them inline in its own render, not as an
// exported map, and a `<button>`'s own styling isn't reusable on an
// `<a>` (a real navigation needs a real link — a <button> wrapped in a
// <Link>, or an onClick-navigate button, both put two interactive
// elements where the accessibility tree expects one).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-on hover:bg-accent-hover active:bg-accent-active active:text-accent-active-on',
  secondary:
    'border border-border-strong bg-surface text-text-primary hover:bg-surface-elevated active:bg-border',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-elevated active:bg-border',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-label',
  sm: 'min-h-11 px-4 text-small',
};

/**
 * A `Button`-styled `<Link>`, for a CTA that navigates rather than
 * submits/triggers an in-page action — `/how-it-works`'s "Find a space"
 * and `/for-businesses`'s "List your space" (Phase 4 item 3). Every
 * existing navigational CTA in this app before this pass (empty-state
 * "Find a space" links on `/account/bookings`/`/account/favorites`/
 * `/account/reviews`) used a plain underlined text link, which reads
 * right for a secondary, in-context prompt but not for a marketing
 * page's single primary conversion action — hence a real button-styled
 * link rather than reusing that pattern here too.
 */
export function LinkButton({ variant = 'primary', size = 'md', className, ...props }: LinkButtonProps) {
  return (
    <Link
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    />
  );
}
