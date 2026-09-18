'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}

/**
 * The shared bottom-sheet primitive 08_DESIGN_SYSTEM.md §8.6 calls for
 * ("Reusable responsive patterns ... a bottom-sheet primitive ... built
 * once in the shared component layer and reused"), first used by the
 * mobile filter panel (§8.6's Filters row: "Filter button → bottom
 * sheet/modal, applied state preserved when reopened") — the panel is
 * always ≤ viewport size (§8.6's Modals row) via `max-h-[85vh]` + its own
 * internal scroll, never the page itself scrolling to reach it.
 *
 * Escape/backdrop-click close, and focus moves to the panel's own close
 * button on open — same discipline as MobileMenu's panel, generalized.
 */
export function BottomSheet({ open, onClose, title, closeLabel, children }: BottomSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* A literal rgba(), not a `bg-x/40` opacity modifier — Tailwind
       * can't compute an alpha channel against our CSS-custom-property
       * colors (same caveat as Alert.tsx), and a scrim is deliberately
       * the same translucent black in both themes rather than a token. */}
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }} onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-lg border-t border-border bg-surface shadow-lg"
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
          <h2 className="text-h4 font-display text-text-primary">{title}</h2>
          <IconButton ref={closeButtonRef} aria-label={closeLabel} onClick={onClose}>
            <span aria-hidden="true" className="text-xl leading-none">
              ✕
            </span>
          </IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
