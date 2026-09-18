import { forwardRef, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Error state (08_DESIGN_SYSTEM.md §8.2's default/focus/error/disabled
   * set for inputs) — sets both the visual treatment and aria-invalid.
   * Pair with <FormField error="..."> in components/ui/FormField.tsx,
   * which owns the actual error-text element this points at via
   * aria-describedby. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        'w-full min-h-11 rounded-sm border bg-surface px-4 text-body text-text-primary',
        'placeholder:text-text-muted',
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
