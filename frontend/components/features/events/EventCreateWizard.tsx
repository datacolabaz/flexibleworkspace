'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/lib/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { track, AnalyticsEvent } from '@/lib/analytics/track';
import { CoverImageUpload } from '@/components/features/events/CoverImageUpload';
import type { EventRecord, EventFormat, EventVisibility } from '@/lib/api-client/events';

// ── Types ─────────────────────────────────────────────────────────────────

interface WizardState {
  title: string;
  format: EventFormat | '';
  shortDescription: string;
  description: string;
  coverImage: string;
  language: string;
  capacity: string;
  visibility: EventVisibility;
  startAt: string;
  endAt: string;
  rsvpDeadline: string;
  doorsOpenAt: string;
  venueOption: 'a' | 'b' | 'c';
  externalVenue: string;
}

const FORMATS: EventFormat[] = [
  'workshop', 'telim', 'seminar', 'gorusme', 'networking',
  'panel', 'podkast', 'foto_video', 'diger',
];

const TOTAL_STEPS = 5;

// ── Component ─────────────────────────────────────────────────────────────

export function EventCreateWizard() {
  const t = useTranslations('eventCreate');
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [autosaveToast, setAutosaveToast] = useState(false);
  const [resumePrompt, setResumePrompt] = useState<EventRecord | null>(null);

  const autosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    track(AnalyticsEvent.EventCreationStarted);
  }, []);

  const [state, setState] = useState<WizardState>({
    title: '',
    format: '',
    shortDescription: '',
    description: '',
    coverImage: '',
    language: 'az',
    capacity: '',
    visibility: 'public',
    startAt: '',
    endAt: '',
    rsvpDeadline: '',
    doorsOpenAt: '',
    venueOption: 'c',
    externalVenue: '',
  });

  // ── Draft resume on mount ──────────────────────────────────────────────

  useEffect(() => {
    async function checkForDraft() {
      try {
        const res = await fetch('/api/events/me', { cache: 'no-store' });
        if (!res.ok) return;
        const events = await res.json() as EventRecord[];
        const existingDraft = events.find((e) => e.status === 'draft');
        if (existingDraft) {
          setResumePrompt(existingDraft);
        }
      } catch {
        // Non-critical — ignore silently
      }
    }
    checkForDraft();
  }, []);

  // ── Unsaved changes warning ────────────────────────────────────────────

  const hasData = state.title.trim().length > 0 || state.shortDescription.trim().length > 0;

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasData && step <= TOTAL_STEPS) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasData, step]);

  // ── Autosave every 30 seconds ──────────────────────────────────────────

  useEffect(() => {
    if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current);

    autosaveTimerRef.current = setInterval(async () => {
      if (!hasData || step > TOTAL_STEPS) return;
      const saved = await saveDraft(true);
      if (saved) {
        setAutosaveToast(true);
        setTimeout(() => setAutosaveToast(false), 3000);
      }
      }, 30_000);

    return () => {
      if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current);
    };
  }, [hasData, step, state, draftId]);

  function update(field: keyof WizardState, value: string) {
    setState((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  // ── Resume draft ───────────────────────────────────────────────────────

  function handleResumeDraft(draft: EventRecord) {
    setDraftId(draft.id);
    setState({
      title: draft.title ?? '',
      format: (draft.format as EventFormat) ?? '',
      shortDescription: draft.shortDescription ?? '',
      description: draft.description ?? '',
      coverImage: draft.coverImage ?? '',
      language: draft.language ?? 'az',
      capacity: draft.capacity != null ? String(draft.capacity) : '',
      visibility: (draft.visibility as EventVisibility) ?? 'public',
      startAt: draft.startAt ? draft.startAt.slice(0, 16) : '',
      endAt: draft.endAt ? draft.endAt.slice(0, 16) : '',
      rsvpDeadline: draft.rsvpDeadline ? draft.rsvpDeadline.slice(0, 16) : '',
      doorsOpenAt: draft.doorsOpenAt ? draft.doorsOpenAt.slice(0, 16) : '',
      venueOption: 'c',
      externalVenue: '',
    });
    setResumePrompt(null);
  }

  // ── Validation per step ────────────────────────────────────────────────

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!state.title.trim()) return t('validationRequired', { field: t('titleLabel') });
      if (!state.format) return t('validationNotSelected', { field: t('formatLabel') });
      if (!state.shortDescription.trim()) return t('validationRequired', { field: t('shortDescLabel') });
    }
    if (s === 2) {
      if (!state.startAt) return t('validationNotSelected', { field: t('startAtLabel') });
      if (!state.endAt) return t('validationNotSelected', { field: t('endAtLabel') });
      if (state.startAt && state.endAt && new Date(state.endAt) <= new Date(state.startAt)) {
        return t('validationEndBeforeStart');
      }
    }
    return null;
  }

  // ── Save draft ─────────────────────────────────────────────────────────

  async function saveDraft(silent = false): Promise<EventRecord | null> {
    if (!silent) setIsSaving(true);
    setError(null);
    try {
      const body = {
        title: state.title || 'Adsız tədbir',
        format: (state.format || 'diger') as EventFormat,
        shortDescription: state.shortDescription,
        description: state.description,
        coverImage: state.coverImage || undefined,
        language: state.language,
        capacity: state.capacity ? Number(state.capacity) : undefined,
        visibility: state.visibility,
        startAt: state.startAt || new Date(Date.now() + 86400000).toISOString(),
        endAt: state.endAt || new Date(Date.now() + 2 * 86400000).toISOString(),
        rsvpDeadline: state.rsvpDeadline || undefined,
        doorsOpenAt: state.doorsOpenAt || undefined,
      };

      if (!draftId) {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Save failed');
        const data = (await res.json()) as EventRecord;
        track(AnalyticsEvent.EventCreated, { event_id: data.id });
        setDraftId(data.id);
        return data;
      } else {
        const res = await fetch(`/api/events/${draftId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Save failed');
        return (await res.json()) as EventRecord;
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : t('saveError'));
      return null;
    } finally {
      if (!silent) setIsSaving(false);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  async function handleNext() {
    const validationError = validateStep(step);
    if (validationError) {
      setError(validationError);
      return;
    }
    // Save after steps 1 and 2
    if (step === 1 || step === 2) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  }

  function handleBack() {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  }

  function handleStepClick(clickedStep: number) {
    // Allow navigating to already-completed steps only
    if (clickedStep < step) {
      setError(null);
      setStep(clickedStep);
    }
  }

  async function handleSaveDraft() {
    const saved = await saveDraft();
    if (saved) {
      setAutosaveToast(true);
      setTimeout(() => setAutosaveToast(false), 3000);
    }
  }

  // ── Publish ────────────────────────────────────────────────────────────

  async function handlePublish() {
    if (!draftId) {
      const saved = await saveDraft();
      if (!saved) return;
    }
    setIsPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${draftId}/publish`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? t('publishError'));
      const published = (await res.json()) as EventRecord;
      track(AnalyticsEvent.EventPublished, { event_id: published.id });
      setPublishedSlug(published.slug);
      setStep(TOTAL_STEPS + 1); // Success screen
    } catch (err) {
      setError(err instanceof Error ? err.message : t('publishError'));
    } finally {
      setIsPublishing(false);
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────

  if (step > TOTAL_STEPS && publishedSlug) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mb-4 text-5xl">🎉</div>
        <h2 className="font-display text-h2 text-text-primary">{t('publishSuccess')}</h2>
        <p className="mt-2 text-body text-text-secondary">{t('publishSuccessMessage')}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => router.push(`/events/${publishedSlug}`)}>
            {t('viewEventCta')}
          </Button>
          <Button variant="secondary" onClick={() => router.push('/events/create')}>
            {t('createAnotherCta')}
          </Button>
        </div>
      </div>
    );
  }

  // ── Resume draft prompt ────────────────────────────────────────────────

  if (resumePrompt) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-8 text-center">
        <div className="mb-3 text-3xl">📝</div>
        <h2 className="font-display text-h2 text-text-primary">{t('resumeDraftTitle')}</h2>
        <p className="mt-2 text-body text-text-secondary">
          {t('resumeDraftPrompt')}
        </p>
        <p className="mt-1 text-label font-semibold text-text-primary">{resumePrompt.title}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => handleResumeDraft(resumePrompt)}>
            {t('resumeDraftYes')}
          </Button>
          <Button variant="secondary" onClick={() => setResumePrompt(null)}>
            {t('resumeDraftNo')}
          </Button>
        </div>
      </div>
    );
  }

  // ── Progress indicator ─────────────────────────────────────────────────

  const stepTitles = [
    t('step1Title'), t('step2Title'), t('step3Title'), t('step4Title'), t('step5Title'),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      {/* Autosave toast */}
      {autosaveToast && (
        <div className="mb-4 rounded-md bg-success-bg p-3 text-small text-success">
          {t('autosaved')}
        </div>
      )}

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-small text-text-muted">
          <span>{stepTitles[step - 1]}</span>
          <span>{t('stepOf', { step, total: TOTAL_STEPS })}</span>
        </div>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleStepClick(i + 1)}
              aria-label={stepTitles[i]}
              className={[
                'h-1 flex-1 rounded-full transition-colors',
                i < step ? 'bg-primary' : 'bg-border',
                i < step - 1 ? 'cursor-pointer hover:opacity-70' : 'cursor-default',
              ].join(' ')}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-error-bg p-3 text-small text-error">{error}</div>
      )}

      {/* ── Step 1: Basic info ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <h2 className="font-display text-h2 text-text-primary">{t('step1Title')}</h2>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('titleLabel')} *
            </label>
            <Input
              value={state.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder={t('titlePlaceholder')}
              maxLength={255}
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('formatLabel')} *
            </label>
            <select
              value={state.format}
              onChange={(e) => update('format', e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline focus:outline-2 focus:outline-primary"
            >
              <option value="">{t('formatPlaceholder')}</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>{t(`formatOptions.${f}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('shortDescLabel')} *
            </label>
            <textarea
              value={state.shortDescription}
              onChange={(e) => update('shortDescription', e.target.value)}
              placeholder={t('shortDescPlaceholder')}
              maxLength={500}
              rows={3}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline focus:outline-2 focus:outline-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('descLabel')}
            </label>
            <textarea
              value={state.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder={t('descPlaceholder')}
              rows={6}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline focus:outline-2 focus:outline-primary"
            />
          </div>

          {/* Feature 2: Cover image upload replaces URL-only input */}
          <CoverImageUpload
            eventId={draftId}
            value={state.coverImage}
            onChange={(url) => update('coverImage', url)}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-label font-semibold text-text-primary">
                {t('capacityLabel')}
              </label>
              <Input
                value={state.capacity}
                onChange={(e) => update('capacity', e.target.value)}
                placeholder={t('capacityPlaceholder')}
                type="number"
                min={1}
              />
            </div>
            <div>
              <label className="mb-1 block text-label font-semibold text-text-primary">
                {t('visibilityLabel')}
              </label>
              <select
                value={state.visibility}
                onChange={(e) => update('visibility', e.target.value as EventVisibility)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline focus:outline-2 focus:outline-primary"
              >
                <option value="public">{t('visibilityPublic')}</option>
                <option value="private">{t('visibilityPrivate')}</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: Date & time ────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="font-display text-h2 text-text-primary">{t('step2Title')}</h2>
          <p className="text-small text-text-muted">{t('timezoneNote')}</p>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('startAtLabel')} *
            </label>
            <Input
              type="datetime-local"
              value={state.startAt}
              onChange={(e) => update('startAt', e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('endAtLabel')} *
            </label>
            <Input
              type="datetime-local"
              value={state.endAt}
              onChange={(e) => update('endAt', e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('rsvpDeadlineLabel')}
            </label>
            <Input
              type="datetime-local"
              value={state.rsvpDeadline}
              onChange={(e) => update('rsvpDeadline', e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-label font-semibold text-text-primary">
              {t('doorsOpenAtLabel')}
            </label>
            <Input
              type="datetime-local"
              value={state.doorsOpenAt}
              onChange={(e) => update('doorsOpenAt', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Venue ──────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="font-display text-h2 text-text-primary">{t('step3Title')}</h2>

          <div className="flex flex-col gap-3">
            {(['a', 'b', 'c'] as const).map((opt) => (
              <label
                key={opt}
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors',
                  state.venueOption === opt
                    ? 'border-primary bg-surface-elevated'
                    : 'border-border bg-surface hover:bg-surface-elevated',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="venueOption"
                  value={opt}
                  checked={state.venueOption === opt}
                  onChange={() => update('venueOption', opt)}
                  className="mt-0.5 shrink-0 accent-primary"
                />
                <span className="text-body text-text-primary">
                  {t(
                    opt === 'a'
                      ? 'venueOptionA'
                      : opt === 'b'
                      ? 'venueOptionB'
                      : 'venueOptionC',
                  )}
                </span>
              </label>
            ))}
          </div>

          {state.venueOption === 'a' && (
            <div>
              <label className="mb-1 block text-label font-semibold text-text-primary">
                {t('externalVenueLabel')}
              </label>
              <Input
                value={state.externalVenue}
                onChange={(e) => update('externalVenue', e.target.value)}
                placeholder={t('externalVenuePlaceholder')}
              />
            </div>
          )}

          {state.venueOption === 'b' && (
            <div className="rounded-md border border-dashed border-border p-4 text-center text-body text-text-muted">
              {'Məkan axtarışı tezliklə — mövcud axtarış istifadə edin:'}
              <a
                href="/search?roomType=room_type.event_space"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-primary underline"
              >
                Axtar →
              </a>
            </div>
          )}

          {state.venueOption === 'c' && (
            <p className="rounded-md bg-info-bg p-4 text-small text-info">
              {'Məkan seçimi olmadan da dərc edə bilərsiniz. Sonradan əlavə etmək mümkündür.'}
            </p>
          )}
        </div>
      )}

      {/* ── Step 4: Preview ────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-display text-h2 text-text-primary">{t('step4Title')}</h2>

          {state.coverImage && (
            <div className="relative w-full aspect-video overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={state.coverImage}
                alt={state.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          )}

          <div className="divide-y divide-border rounded-md border border-border">
            {[
              { label: t('titleLabel'), value: state.title },
              { label: t('previewFormat'), value: state.format ? t(`formatOptions.${state.format}`) : '—' },
              { label: t('shortDescLabel'), value: state.shortDescription },
              {
                label: t('previewStart'),
                value: state.startAt ? new Date(state.startAt).toLocaleString('az', { timeZone: 'Asia/Baku' }) : '—',
              },
              {
                label: t('previewEnd'),
                value: state.endAt ? new Date(state.endAt).toLocaleString('az', { timeZone: 'Asia/Baku' }) : '—',
              },
              {
                label: t('previewCapacity'),
                value: state.capacity ? state.capacity : t('previewCapacityUnlimited'),
              },
              {
                label: t('previewVenue'),
                value:
                  state.venueOption === 'a'
                    ? state.externalVenue || '—'
                    : state.venueOption === 'b'
                    ? 'Spotva-dan'
                    : t('previewNoVenue'),
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 px-4 py-3">
                <span className="w-36 shrink-0 text-small font-semibold text-text-muted">{label}</span>
                <span className="text-body text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 5: Publish ────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-6">
          <h2 className="font-display text-h2 text-text-primary">{t('step5Title')}</h2>
          <p className="text-body text-text-secondary">
            {'Aşağıdakı düyməyə basdıqda tədbir dərc ediləcək və qeydiyyat açılacaq.'}
          </p>
          <Button
            onClick={handlePublish}
            isLoading={isPublishing}
            fullWidth
            size="md"
          >
            {t('publishButtonFinal')}
          </Button>
        </div>
      )}

      {/* ── Navigation buttons ─────────────────────────────────────────── */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back + Draft save */}
        <div className="flex gap-3">
          {step > 1 && step <= TOTAL_STEPS && (
            <Button variant="secondary" onClick={handleBack}>
              {t('backButton')}
            </Button>
          )}
          {hasData && step <= TOTAL_STEPS && (
            <Button variant="secondary" onClick={handleSaveDraft} isLoading={isSaving}>
              {t('draftSaveButton')}
            </Button>
          )}
        </div>

        {/* Right: Continue */}
        {step < TOTAL_STEPS && (
          <Button onClick={handleNext} isLoading={isSaving} className="ml-auto">
            {t('continueButton')}
          </Button>
        )}
      </div>
    </div>
  );
}
