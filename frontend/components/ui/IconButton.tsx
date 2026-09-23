import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required, not optional — every icon-only control needs an
   * accessible name (07_UX_ARCHITECTURE.md §7.7: "ARIA labels on every
   * icon-only control"). TypeScript enforces it can't be forgotten. */
  'aria-label': string;
  /** 'md' (44px, the default) satisfies 08_DESIGN_SYSTEM.md §8.6's
   * touch-target rule directly, rather than every icon control
   * re-deriving it — keep it for anything that's its own standalone
   * control (nav, toolbars). 'sm' (32px) is for a control that's
   * layered ON something else with its own generous hit area around it
   * (e.g. BookmarkButton's photo-corner overlay) — at 44px it visually
   * overwhelmed a small card thumbnail. */
  size?: IconButtonSize;
}

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  md: 'h-11 w-11',
  sm: 'h-8 w-8',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, type = 'button', size = 'md', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-md text-text-primary transition-colors',
        SIZE_CLASSES[size],
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
