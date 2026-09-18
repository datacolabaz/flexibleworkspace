import { forwardRef, type SelectHTMLAttributes } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/** A native <select> — keyboard-navigable and screen-reader-native for
 * free (08_DESIGN_SYSTEM.md §8.2 lists "language switcher, sort control,
 * currency" as its first use cases), styled to match <Input>'s border/
 * focus treatment rather than the browser default chrome. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        'min-h-11 rounded-sm border bg-surface px-3 text-body text-text-primary',
        'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-error' : 'border-border-strong focus:border-primary',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    />
  );
});
