const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Label for organizer on cards and the public event page.
 * Prefer API `organizerName` (display name or email local-part). Never
 * show a raw user UUID — fall back to the translated "Organizer" string.
 */
export function organizerDisplayLabel(
  event: { organizerName?: string | null; organizerId?: string | null },
  fallback: string,
): string {
  const name = event.organizerName?.trim();
  if (name && !isUuid(name)) return name;
  return fallback;
}
