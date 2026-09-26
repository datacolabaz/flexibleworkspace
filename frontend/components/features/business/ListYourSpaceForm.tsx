'use client';

import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { track, AnalyticsEvent } from '@/lib/analytics/track';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

type LocationCategory = {
  id: string;
  slug: string;
  nameAz: string;
  nameEn: string;
  sortOrder: number;
};

/** Static fallback list — shown when the API is unavailable. */
const STATIC_CATEGORIES: LocationCategory[] = [
  { id: 'studiya', slug: 'studiya', nameAz: 'Studiya', nameEn: 'Studio', sortOrder: 1 },
  { id: 'telim-otagi', slug: 'telim-otagi', nameAz: 'Təlim otağı', nameEn: 'Training Room', sortOrder: 2 },
  { id: 'workshop-otagi', slug: 'workshop-otagi', nameAz: 'Workshop otağı', nameEn: 'Workshop Space', sortOrder: 3 },
  { id: 'coworking', slug: 'coworking', nameAz: 'Coworking', nameEn: 'Coworking', sortOrder: 4 },
  { id: 'icas-otagi', slug: 'icas-otagi', nameAz: 'İclas otağı', nameEn: 'Meeting Room', sortOrder: 5 },
  { id: 'podkast-studiyasi', slug: 'podkast-studiyasi', nameAz: 'Podkast studiyası', nameEn: 'Podcast Studio', sortOrder: 6 },
  { id: 'foto-video-studiya', slug: 'foto-video-studiya', nameAz: 'Foto və video studiyası', nameEn: 'Photo & Video Studio', sortOrder: 7 },
  { id: 'sinif-otagi', slug: 'sinif-otagi', nameAz: 'Sinif otağı', nameEn: 'Classroom', sortOrder: 8 },
  { id: 'seminar-otagi', slug: 'seminar-otagi', nameAz: 'Seminar otağı', nameEn: 'Seminar Room', sortOrder: 9 },
  { id: 'konfrans-otagi', slug: 'konfrans-otagi', nameAz: 'Konfrans otağı', nameEn: 'Conference Room', sortOrder: 10 },
  { id: 'ferdi-ofis', slug: 'ferdi-ofis', nameAz: 'Fərdi ofis', nameEn: 'Private Office', sortOrder: 11 },
  { id: 'tdbir-mkani', slug: 'tdbir-mkani', nameAz: 'Tədbir məkanı', nameEn: 'Event Space', sortOrder: 12 },
  { id: 'emalatxana', slug: 'emalatxana', nameAz: 'Emalatxana sahəsi', nameEn: 'Workshop Area', sortOrder: 13 },
];

const MAX_LOGO_BYTES = 8 * 1024 * 1024;

// Drag-and-drop always hands the browser a File with `.type` correctly
// resolved from the OS. A file picked through the native <input
// type="file"> dialog isn't guaranteed the same treatment — some OS/
// browser combinations leave `file.type` as an empty string for a
// perfectly valid image, which the strict `file.type.startsWith('image/')`
// check then rejected with no visible reason (see the matching fix and
// longer comment in ProviderRoomsPanel.tsx, where the same pattern
// broke room-photo uploads specifically for the click-to-choose path).
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;

function isLikelyImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXTENSION_PATTERN.test(file.name);
}

/**
 * `/list-your-space`'s registration form — proxies `POST /providers`
 * through `app/api/providers/route.ts` (a Client Component can't read
 * the session cookie itself, same reasoning as every other BFF-backed
 * form). `legalName`/`displayName` required, `category` optional, the
 * same three fields `CreateProviderDto` actually validates — no extra
 * fields invented for a "fuller-looking" form (no address/phone/etc.:
 * a provider's `Location`s, with their own address, are added later
 * through the not-yet-built provider dashboard, per `09_DOMAIN_MODEL.md`
 * §9.2's Provider/Location split).
 *
 * A provider flagged this form had no way to add a photo at all — the
 * logo/cover photo below is now a REQUIRED second step, validated
 * client-side before submit (owner's decision: every application needs
 * at least one photo, mirroring `ROOM_NO_PHOTOS` gating a room's own
 * activation). `POST /providers` (JSON) creates the provider, then
 * `POST /api/providers/:id/logo` (multipart) uploads the photo that
 * validation already guaranteed is picked. It's a separate request
 * rather than one combined multipart submit because `POST /providers`
 * is the typed, OpenAPI-contracted endpoint (`providers.ts`'s
 * `registerProvider`) — changing its shape would mean updating
 * `29_API_OPENAPI.yaml` and regenerating the generated client, out of
 * scope here. A failed *upload* (network hiccup, etc.) still never blocks
 * registration success once the provider row exists — the application is
 * real either way; `logoFailed` just surfaces that the photo itself needs
 * retrying.
 *
 * On success, redirects straight into `/provider` (owner's decision:
 * "doldur sonra ordan ora keç lazım deyil" — one continuous flow, not a
 * dead-end thank-you screen the person has to navigate away from
 * themselves). `verificationStatus` starts `PENDING` — the provider can
 * still add rooms/photos immediately; only *activating* a room needs
 * admin verification (`ROOM_NO_PHOTOS`/`PROVIDER_NOT_VERIFIED` gating in
 * `RoomsService.setStatus`), so there's nothing to wait for here.
 */
export function ListYourSpaceForm() {
  const t = useTranslations('listYourSpace');
  const router = useRouter();

  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<LocationCategory[]>(STATIC_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // Load categories from API on mount; fall back silently to the static list.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/location-categories');
        if (r && r.ok) {
          const data = (await r.json()) as LocationCategory[];
          if (Array.isArray(data) && data.length > 0) setCategories(data);
        }
      } catch {
        // silent: static list already in state
      } finally {
        setCategoriesLoading(false);
      }
    })();
  }, []);

  function toggleCategory(slug: string) {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Unlike ProviderRoomsPanel's photo input, this one is NOT reset to ''
    // after reading the file — this is a single required field, not a
    // repeatable multi-select, and clearing it here was wiping out the
    // browser's own native "<filename>" indicator right next to the
    // Choose File button, leaving it stuck on "No file chosen" even once
    // a valid logo was picked (the small caption below it still showed
    // the name, but that native label reading empty looked broken).
    setError(undefined);
    if (!file) {
      setLogoFile(null);
      return;
    }
    if (!isLikelyImageFile(file)) {
      setError(t('logoTypeError'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t('logoSizeError'));
      return;
    }
    setLogoFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    track(AnalyticsEvent.ProviderOnboardingStarted);
    const trimmedLegalName = legalName.trim();
    const trimmedDisplayName = displayName.trim();
    if (!trimmedLegalName || !trimmedDisplayName) {
      setError(t('requiredFieldsError'));
      return;
    }
    if (!logoFile) {
      setError(t('logoRequiredError'));
      return;
    }

    setIsSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          selectedCategories.length > 0
            ? { legalName: trimmedLegalName, displayName: trimmedDisplayName, categories: selectedCategories }
            : { legalName: trimmedLegalName, displayName: trimmedDisplayName },
        ),
      });
      if (!response.ok) {
        let code: string | undefined;
        try {
          code = ((await response.json()) as BffErrorBody).error?.code;
        } catch {
          // no JSON body — fall through to the generic message
        }
        setError(code === 'UNAUTHENTICATED' ? t('signedOutError') : t('genericError'));
        setIsSubmitting(false);
        return;
      }

      const provider = (await response.json()) as { id: string };
      track(AnalyticsEvent.ProviderProfileCreated, { provider_id: provider.id });
      // logoFile is guaranteed non-null past the check above — the
      // provider row already exists at this point regardless of what
      // happens to the photo upload, so an upload hiccup here must not
      // block the redirect; the provider can just re-add a logo from
      // `/provider` afterward.
      try {
        const formData = new FormData();
        formData.set('logo', logoFile);
        await fetch(`/api/providers/${provider.id}/logo`, { method: 'POST', body: formData });
      } catch {
        // best-effort — see comment above
      }
      // The backend just granted this account the PROVIDER_OWNER role
      // (ProvidersService.create()), but the access token cookie already
      // sitting in the browser was issued BEFORE that — roles are baked
      // into the JWT at sign-in time, not looked up fresh per request
      // (JwtAuthGuard/RolesGuard). Without rotating it here, the redirect
      // below lands back on `/provider` with a still-stale token, and
      // every @Roles(PROVIDER_OWNER)-gated call it makes (locations,
      // rooms, leads) 403s — the account looks broken on its very first
      // visit. `/api/auth/refresh` re-reads this user's roles from the DB
      // and rotates both cookies; best-effort like the logo upload above,
      // since a redirect with a still-stale token is still better than no
      // redirect at all.
      try {
        const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!refreshResponse.ok) {
          setError(t('sessionRefreshFailed'));
          setIsSubmitting(false);
          return;
        }
      } catch {
        setError(t('sessionRefreshFailed'));
        setIsSubmitting(false);
        return;
      }
      // `router.refresh()` first: when this form is rendered standalone
      // on `/list-your-space` the push below does the real navigation,
      // but when it's embedded inline on `/provider` itself (the
      // NOT_A_PROVIDER branch), pushing to the SAME url is a no-op in
      // the App Router — refresh() is what actually re-runs that Server
      // Component now that `getMyProvider` will succeed.
      router.refresh();
      router.push('/provider');
    } catch {
      setError(t('genericError'));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-md flex-col gap-5">
      {error && <Alert variant="error">{error}</Alert>}

      <FormField id="lys-legal-name" label={t('legalNameLabel')} hint={t('legalNameHint')}>
        <Input
          id="lys-legal-name"
          name="legalName"
          type="text"
          value={legalName}
          disabled={isSubmitting}
          aria-describedby={fieldDescribedBy('lys-legal-name', { hint: t('legalNameHint') })}
          onChange={(event) => setLegalName(event.target.value)}
        />
      </FormField>

      <FormField id="lys-display-name" label={t('displayNameLabel')} hint={t('displayNameHint')}>
        <Input
          id="lys-display-name"
          name="displayName"
          type="text"
          value={displayName}
          disabled={isSubmitting}
          aria-describedby={fieldDescribedBy('lys-display-name', { hint: t('displayNameHint') })}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </FormField>

      <FormField id="lys-category" label={t('categoryLabel')} hint={t('categoryHint')}>
        {categoriesLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-sm" />
            ))}
          </div>
        ) : (
          <div
            id="lys-category"
            role="group"
            aria-describedby={fieldDescribedBy('lys-category', { hint: t('categoryHint') })}
            className="grid grid-cols-2 gap-2"
          >
            {categories.map((cat) => (
              <label
                key={cat.slug}
                className="flex min-h-9 cursor-pointer items-center gap-2 text-small text-text-primary"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat.slug)}
                  disabled={isSubmitting}
                  onChange={() => toggleCategory(cat.slug)}
                  className="h-4 w-4 rounded-sm border-border-strong text-primary focus:ring-primary"
                />
                {cat.nameAz}
              </label>
            ))}
          </div>
        )}
      </FormField>

      <FormField id="lys-logo" label={t('logoLabel')} hint={t('logoHint')}>
        <input
          id="lys-logo"
          name="logo"
          type="file"
          accept="image/*"
          disabled={isSubmitting}
          onChange={handleLogoChange}
          aria-describedby={fieldDescribedBy('lys-logo', { hint: t('logoHint') })}
          className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-label file:text-accent-on disabled:cursor-not-allowed disabled:opacity-50"
        />
        {logoFile && <p className="mt-1.5 text-caption text-text-muted">{logoFile.name}</p>}
      </FormField>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {isSubmitting ? t('submittingButton') : t('submitButton')}
      </Button>
    </form>
  );
}
