'use client';

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface OtpInputProps {
  length?: number;
  /** The full code as one string — this component holds no state of its
   * own, so the parent (which knows about request/verify/error state
   * anyway) is the single source of truth. */
  value: string;
  onChange: (code: string) => void;
  /** Fires once every box is filled — lets a caller auto-submit without
   * making the person also find and press a "Verify" button. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** id placed on the first box, so a <FormField>/<label> pointing at
   * this id lands focus on box 1. */
  id?: string;
  /** Accessible name for the group of boxes as a whole. */
  label: string;
  /** Per-box accessible name, e.g. (i, len) => `Digit ${i + 1} of ${len}`
   * — left to the caller so it can be translated. */
  digitLabel: (index: number, length: number) => string;
  /** Focus the first box once, on mount — used when this step of a flow
   * has just become visible, without relying on the HTML `autofocus`
   * attribute (which fires unconditionally, including on re-mounts a
   * screen-reader user didn't initiate). */
  focusFirstOnMount?: boolean;
}

/**
 * A segmented one-time-code input: one single-digit box per character,
 * arrow-key and backspace navigation between them, and paste support that
 * distributes a full code across the boxes from wherever it's dropped —
 * the standard OTP-entry pattern, built once here rather than per
 * feature that needs a code (08_DESIGN_SYSTEM.md §8.2's brief for
 * primitives with no business logic of their own).
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled = false,
  invalid = false,
  id = 'otp',
  label,
  digitLabel,
  focusFirstOnMount = false,
}: OtpInputProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (focusFirstOnMount) {
      inputRefs.current[0]?.focus();
    }
    // Intentionally mount-only: this fires when the OTP step first
    // appears, not on every value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(nextDigits: string[]) {
    const code = nextDigits.join('');
    onChange(code);
    // Checking the *array* for a still-empty slot, not the joined string:
    // `code.includes('')` is always true (every string trivially contains
    // the empty string as a substring), so that check would never gate
    // anything — it has to be `nextDigits`, one entry per box.
    if (nextDigits.every((digit) => digit !== '') && onComplete) {
      onComplete(code);
    }
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = digits.slice();
    next[index] = digit;
    commit(next);
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      const next = digits.slice();
      next[index - 1] = '';
      commit(next);
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    const chars = pasted.slice(0, length - index).split('');
    const next = digits.slice();
    chars.forEach((char, offset) => {
      next[index + offset] = char;
    });
    commit(next);
    const lastFilled = Math.min(index + chars.length, length - 1);
    inputRefs.current[lastFilled]?.focus();
  }

  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          id={index === 0 ? id : undefined}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={digitLabel(index, length)}
          aria-invalid={invalid || undefined}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          className={[
            'h-12 w-11 rounded-sm border bg-surface text-center text-h4 font-semibold text-text-primary',
            'focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            invalid ? 'border-error' : 'border-border-strong',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
