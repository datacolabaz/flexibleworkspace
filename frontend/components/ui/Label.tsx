import type { LabelHTMLAttributes } from 'react';

/**
 * An explicit <label>, always paired with a field's `id` via `htmlFor` —
 * 07_UX_ARCHITECTURE.md §7.7's "explicit <label> elements, never
 * placeholder-as-label" rule, built once here so it can't be skipped per
 * call site.
 */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={['mb-1.5 block text-label text-text-primary', className ?? ''].join(' ').trim()}
      {...props}
    />
  );
}
