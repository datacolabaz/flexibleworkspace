import type { HTMLAttributes } from 'react';

/** A pulsing placeholder block, shaped by the caller via `className`
 * (width/height/rounding) — 07_UX_ARCHITECTURE.md §7.6's "skeleton
 * blocks matching final content shape," built once and reused rather
 * than a bespoke loading state per screen. `motion-reduce:animate-none`
 * matches the same reduced-motion discipline as <Spinner>. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={['animate-pulse motion-reduce:animate-none rounded-sm bg-surface-elevated', className ?? '']
        .join(' ')
        .trim()}
      {...props}
    />
  );
}
