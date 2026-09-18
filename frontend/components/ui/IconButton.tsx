import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required, not optional — every icon-only control needs an
   * accessible name (07_UX_ARCHITECTURE.md §7.7: "ARIA labels on every
   * icon-only control"). TypeScript enforces it can't be forgotten. */
  'aria-label': string;
}

/** A square, icon-only button — the theme toggle, the mobile-nav
 * hamburger, and anything else that's a single glyph with no visible
 * text. h-11/w-11 (44px) satisfies 08_DESIGN_SYSTEM.md §8.6's touch-target
 * rule directly, rather than every icon control re-deriving it. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-primary transition-colors',
        'hover:bg-surface-elevated active:bg-border',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    />
  );
});
