'use client';

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export interface StarRatingInputProps {
  id: string;
  name: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Accessible name for the whole control (the fieldset's legend text,
   * visually hidden — the visible label lives outside via `FormField`,
   * same split `fieldDescribedBy` already uses elsewhere). */
  label: string;
  /** `starLabel(3)` -> "3 stars" etc, so each star's own accessible name
   * is locale-correct rather than a hardcoded "N star(s)" in English. */
  starLabel: (value: number) => string;
}

/**
 * A 1-5 star rating input for `WriteReviewForm` — no icon library in this
 * codebase (★/☆ text glyphs, same convention as `RoomListingCard`'s
 * rating display and `BookmarkButton`'s ♥/♡). Built as a native radio
 * group (visually-hidden `<input type="radio">` + a `<label>` styled as
 * a star) rather than a row of `<button>`s with manual keyboard handling
 * — radios already give arrow-key navigation, a single tab stop, and a
 * real form value for free, and degrade to something usable with CSS
 * disabled entirely.
 */
export function StarRatingInput({ id, name, value, onChange, disabled, label, starLabel }: StarRatingInputProps) {
  return (
    <fieldset className="flex flex-col gap-1" disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {STAR_VALUES.map((starValue) => {
          const inputId = `${id}-${starValue}`;
          const filled = starValue <= value;
          return (
            <span key={starValue} className="relative">
              <input
                type="radio"
                id={inputId}
                name={name}
                value={starValue}
                checked={value === starValue}
                disabled={disabled}
                onChange={() => onChange(starValue)}
                className="peer absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
              <label
                htmlFor={inputId}
                aria-label={starLabel(starValue)}
                className={[
                  'flex h-11 w-11 cursor-pointer items-center justify-center text-h3 leading-none transition-colors',
                  filled ? 'text-accent' : 'text-border-strong',
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
                  'peer-disabled:cursor-not-allowed',
                ].join(' ')}
              >
                <span aria-hidden="true">{filled ? '★' : '☆'}</span>
              </label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface StarRatingDisplayProps {
  rating: number;
  label: string;
  className?: string;
}

/** A read-only 1-5 star rating — `ReviewListItem`'s per-review rating.
 * Distinct from `RoomListingCard`'s inline average-rating markup (that
 * one shows a single "★ 4.7 (12)" summary, not five discrete stars). */
export function StarRatingDisplay({ rating, label, className }: StarRatingDisplayProps) {
  return (
    <span className={['inline-flex items-center gap-0.5 text-label', className ?? ''].join(' ').trim()} role="img" aria-label={label}>
      {STAR_VALUES.map((starValue) => (
        <span key={starValue} aria-hidden="true" className={starValue <= rating ? 'text-accent' : 'text-border-strong'}>
          {starValue <= rating ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}
