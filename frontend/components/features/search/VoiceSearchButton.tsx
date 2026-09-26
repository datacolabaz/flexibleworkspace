'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { FilterDraft } from './SearchFilters';

interface MetroStation {
  id: string;
  nameAz: string;
  nameEn: string;
  line?: string;
}

interface VoiceParsedFilters {
  city?: string;
  metroStation?: string;
  roomType?: string;
  participants?: number;
  maxHourlyPrice?: number;
  date?: string;
  startTime?: string;
  durationMinutes?: number;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'error';
type VoiceErrorKey = 'voicePermissionError' | 'voiceNoSpeech' | 'voiceNetworkError' | 'voiceError';

interface Props {
  metroStations: MetroStation[];
  roomTypes: string[];
  currentDraft: FilterDraft;
  onApply: (draft: FilterDraft) => void;
}

// Minimal type definitions for the Web Speech API (not fully typed in TS DOM lib).
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechRecognitionResultEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// Vendor-prefix shim — webkitSpeechRecognition is not in the TS lib.
function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .webkitSpeechRecognition
  );
}

export function VoiceSearchButton({ metroStations, roomTypes, currentDraft, onApply }: Props) {
  const t = useTranslations('search');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [errorKey, setErrorKey] = useState<VoiceErrorKey>('voiceError');
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    if (getSpeechRecognitionCtor()) setSupported(true);
  }, []);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      setVoiceState('processing');
      try {
        const res = await fetch('/api/search/voice-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            availableMetroStations: metroStations.map((s) => s.nameAz),
            availableRoomTypes: roomTypes,
          }),
        });
        if (!res.ok) throw new Error('Parse failed');
        const parsed = (await res.json()) as VoiceParsedFilters;

        // Merge parsed fields onto the current filter draft.
        const next: FilterDraft = { ...currentDraft };
        if (parsed.city) next.city = parsed.city;
        if (parsed.roomType) next.roomType = parsed.roomType;
        if (typeof parsed.participants === 'number') next.participants = String(parsed.participants);
        if (typeof parsed.maxHourlyPrice === 'number') next.priceMax = String(parsed.maxHourlyPrice);
        if (parsed.date) next.date = parsed.date;
        if (parsed.startTime) next.startTime = parsed.startTime;
        if (typeof parsed.durationMinutes === 'number') {
          next.durationMinutes = String(parsed.durationMinutes);
        }
        // Map metro station name → id.
        if (parsed.metroStation) {
          const station = metroStations.find((s) => s.nameAz === parsed.metroStation);
          if (station) next.metroStationId = station.id;
        }

        onApply(next);
        setVoiceState('idle');
      } catch {
        setVoiceState('error');
        setTimeout(() => setVoiceState('idle'), 3000);
      }
    },
    [metroStations, roomTypes, currentDraft, onApply],
  );

  function handleClick() {
    if (voiceState === 'listening') {
      recognitionRef.current?.stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognitionRef.current = recognition;

    // Use the browser/device locale for best recognition accuracy on iOS/Safari.
    // This keeps transcription working broadly while the server-side parser
    // handles Azerbaijani keyword matching regardless of the recognition language.
    recognition.lang =
      (typeof navigator !== 'undefined' && navigator.language) || 'ru-RU';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript) void handleTranscript(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const code = event.error ?? '';
      let key: VoiceErrorKey = 'voiceError';
      if (code === 'not-allowed' || code === 'permission-denied') {
        key = 'voicePermissionError';
      } else if (code === 'no-speech') {
        key = 'voiceNoSpeech';
      } else if (code === 'network') {
        key = 'voiceNetworkError';
      }
      setErrorKey(key);
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 3000);
    };

    recognition.onend = () => {
      // If still 'listening' after end (no result / aborted), reset to idle.
      setVoiceState((current) => (current === 'listening' ? 'idle' : current));
    };

    // recognition.start() can throw synchronously on HTTP (insecure context) or
    // in unsupported environments. Catch it and hide the button cleanly.
    try {
      recognition.start();
    } catch {
      setSupported(false);
      return;
    }
    setVoiceState('listening');
  }

  // Hide on desktop (md: and up) and also hide entirely if not supported.
  if (!supported) return null;

  const isListening = voiceState === 'listening';
  const isProcessing = voiceState === 'processing';
  const isError = voiceState === 'error';

  const ariaLabel = isListening
    ? t('voiceListening')
    : isProcessing
      ? t('voiceProcessing')
      : t('voiceSearch');

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={handleClick}
        disabled={isProcessing}
        aria-label={ariaLabel}
        className={[
          'flex items-center justify-center rounded-md border p-2.5 transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
          isListening
            ? 'animate-pulse border-error bg-error/10 text-error'
            : isError
              ? 'border-error bg-error/10 text-error'
              : 'border-border bg-surface text-text-secondary hover:border-primary hover:text-primary',
          isProcessing ? 'opacity-60 cursor-not-allowed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isProcessing ? (
          /* Spinner */
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 animate-spin fill-none stroke-current stroke-2"
          >
            <circle cx="12" cy="12" r="10" className="opacity-25" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          /* Microphone icon */
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 fill-none stroke-current stroke-2"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" strokeLinejoin="round" />
            <path d="M5 10a7 7 0 0014 0" strokeLinecap="round" />
            <path d="M12 17v4" strokeLinecap="round" />
            <path d="M9 21h6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Tooltip / status label */}
      {(isListening || isError) && (
        <span
          aria-live="polite"
          className={[
            'absolute bottom-[calc(100%+0.375rem)] left-1/2 -translate-x-1/2 whitespace-nowrap',
            'rounded-md px-2 py-1 text-caption shadow-sm',
            isError
              ? 'bg-error/10 text-error'
              : 'bg-surface-elevated text-text-secondary',
          ].join(' ')}
        >
          {isError ? t(errorKey) : t('voiceListening')}
        </span>
      )}
    </div>
  );
}
