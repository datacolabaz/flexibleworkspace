/**
 * A small inline loading indicator, used inside <Button isLoading /> and
 * anywhere else a control needs to show "working" without leaving its own
 * place in the layout. `motion-reduce:animate-none` honors
 * `07_UX_ARCHITECTURE.md` §7.7 / `08_DESIGN_SYSTEM.md`'s reduced-motion
 * requirement — the ring is still visible, it just doesn't spin.
 *
 * Decorative by default (`aria-hidden`): the loading *state* is announced
 * by the text around it (a button's own label change, a form's aria-live
 * region), not by this icon — an icon-only "loading" announcement with no
 * context isn't useful to a screen-reader user. Pass `label` only for the
 * rare case where the spinner is the only loading indicator on screen.
 */
export function Spinner({
  className = 'h-4 w-4',
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <svg
      className={`inline-block animate-spin motion-reduce:animate-none ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
