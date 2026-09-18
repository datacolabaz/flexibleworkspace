import type { ReactNode } from 'react';
import { Label } from './Label';

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Composes a <Label> with the field itself and its hint/error text,
 * wiring the ids once here instead of at every call site
 * (07_UX_ARCHITECTURE.md §7.7: explicit labels; screen-reader-visible
 * error text on every invalid field).
 *
 * Contract: the field element inside `children` is responsible for its
 * own `id={id}` and `aria-describedby={fieldDescribedBy(id, {hint,
 * error})}` — FormField only renders the description text, since only
 * the caller's render (a Client Component tracking its own error state)
 * knows which id is current at any given moment.
 */
export function FormField({ id, label, hint, error, children, className }: FormFieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-small text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-small text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The id a field's own aria-describedby should point at, given its
 * current hint/error state — error wins when both are present, mirroring
 * which one FormField actually renders. */
export function fieldDescribedBy(id: string, state: { hint?: string; error?: string }): string | undefined {
  if (state.error) return `${id}-error`;
  if (state.hint) return `${id}-hint`;
  return undefined;
}
