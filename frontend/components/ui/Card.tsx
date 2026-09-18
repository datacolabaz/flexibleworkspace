import type { HTMLAttributes } from 'react';

/** A surface panel — resting-state shadow, per styles/tokens.css's
 * --shadow-sm ("resting cards"). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['rounded-lg border border-border bg-surface p-6 shadow-sm', className ?? '']
        .join(' ')
        .trim()}
      {...props}
    />
  );
}
