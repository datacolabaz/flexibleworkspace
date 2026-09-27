const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public organizer label: display name, else email local-part, never a user UUID. */
export function organizerPublicName(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string | null {
  const name = displayName?.trim();
  if (name && !UUID_RE.test(name)) return name;
  const at = email?.trim().indexOf('@') ?? -1;
  const local = at > 0 ? email!.trim().slice(0, at).trim() : '';
  if (local && !UUID_RE.test(local)) return local;
  return null;
}
