import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button, and sets aria-busy — the
   * "loading" state 08_DESIGN_SYSTEM.md §8.2 requires alongside
   * default/hover/active/disabled for every button. Callers swap the
   * label text themselves (e.g. "Send code" -> "Sending code…") since
   * only the caller knows the right in-progress copy. */
  isLoading?: boolean;
  fullWidth?: boolean;
}

// CTA (amber) uses dark text by default/hover and only flips to white on
// the pressed state — styles/tokens.css's --color-accent-active-on note,
// "do not swap" — so `active:` here intentionally names both the bg and
// text-color pair together rather than composing them separately.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-on hover:bg-accent-hover active:bg-accent-active active:text-accent-active-on',
  secondary:
    'border border-border-strong bg-surface text-text-primary hover:bg-surface-elevated active:bg-border',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-elevated active:bg-border',
};

// min-h-11 (44px) satisfies 08_DESIGN_SYSTEM.md §8.6's touch-target rule
// at every size — sm only shrinks the horizontal footprint, not height.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-5 text-label',
  sm: 'min-h-11 px-4 text-small',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || isLoading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    >
      {isLoading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});
