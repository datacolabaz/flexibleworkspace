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

type VoiceState =
  | 'idle'
  | 'recording'
  | 'processing'
  | 'done'
  | 'error';

type VoiceErrorKey =
  | 'voicePermissionError'
  | 'voiceNoSpeech'
  | 'voiceNetworkError'
  | 'voiceError';

interface Props {
  metroStations: MetroStation[];
  roomTypes: string[];
  currentDraft: FilterDraft;
  onApply: (draft: FilterDraft) => void;
}

const MAX_RECORDING_SECONDS = 8;

/**
 * Returns the best supported MIME type for MediaRecorder.
 * Checks audio/mp4 FIRST because iOS Safari only supports mp4 (AAC) and
 * does NOT support audio/webm. Returns '' if nothing is supported.
 */
function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // iOS Safari only supports audio/mp4 — check it first
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  return '';
}

export function VoiceSearchButton({
  metroStations,
  roomTypes,
  currentDraft,
  onApply,
}: Props) {
  const t = useTranslations('search');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [errorKey, setErrorKey] = useState<VoiceErrorKey>('voiceError');
  const [countdown, setCountdown] = useState(MAX_RECORDING_SECONDS);
  const [supported, setSupported] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Timestamp (ms) when recording actually started — used for minimum duration guard. */
  const recordingStartRef = useRef<number>(0);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator?.mediaDevices?.getUserMedia === 'function'
    ) {
      setSupported(true);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimers();
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimers() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const handleRecordingDone = useCallback(
    async (chunks: Blob[], mimeType: string) => {
      console.log('[VoiceSearch] handleRecordingDone — chunks:', chunks.length, 'mimeType:', mimeType);

      if (chunks.length === 0) {
        console.warn('[VoiceSearch] No audio chunks captured — recording likely failed (iOS MIME issue or permission)');
        setErrorKey('voiceNoSpeech');
        setVoiceState('error');
        setTimeout(() => setVoiceState('idle'), 3000);
        return;
      }

      const totalBytes = chunks.reduce((sum, c) => sum + c.size, 0);
      console.log('[VoiceSearch] Total audio size:', totalBytes, 'bytes');
      if (totalBytes < 100) {
        console.warn('[VoiceSearch] Audio blob too small (<100 bytes), likely silent/empty');
        setErrorKey('voiceNoSpeech');
        setVoiceState('error');
        setTimeout(() => setVoiceState('idle'), 3000);
        return;
      }

      setVoiceState('processing');

      try {
        // Step 1: Transcribe via Whisper
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const filename = `voice.${ext}`;
        const audioBlob = new Blob(chunks, { type: mimeType });
        console.log('[VoiceSearch] Sending to /api/search/voice-transcribe:', filename, audioBlob.size, 'bytes');
        const formData = new FormData();
        formData.append('audio', audioBlob, filename);

        const transcribeRes = await fetch('/api/search/voice-transcribe', {
          method: 'POST',
          body: formData,
        });

        if (!transcribeRes.ok) {
          console.error('[VoiceSearch] Transcribe request failed:', transcribeRes.status);
          throw new Error('transcribe_failed');
        }
        const { transcript, error: transcribeError } =
          (await transcribeRes.json()) as { transcript: string; error?: string };

        console.log('[VoiceSearch] Transcript result:', JSON.stringify(transcript), 'error:', transcribeError);

        if (transcribeError === 'no_audio_file') {
          setErrorKey('voiceNoSpeech');
          setVoiceState('error');
          setTimeout(() => setVoiceState('idle'), 3000);
          return;
        }

        if (transcribeError && transcribeError !== 'empty_transcript') {
          setErrorKey('voiceNetworkError');
          setVoiceState('error');
          setTimeout(() => setVoiceState('idle'), 3000);
          return;
        }

        if (!transcript) {
          // Whisper returned empty — audio was likely silent
          setErrorKey('voiceNoSpeech');
          setVoiceState('error');
          setTimeout(() => setVoiceState('idle'), 3000);
          return;
        }

        // Step 2: Parse transcript → filters
        const parseRes = await fetch('/api/search/voice-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            availableMetroStations: metroStations.map((s) => s.nameAz),
            availableRoomTypes: roomTypes,
          }),
        });

        if (!parseRes.ok) throw new Error('parse_failed');
        const parsed = (await parseRes.json()) as VoiceParsedFilters;

        // Step 3: Merge parsed fields onto the current filter draft
        const next: FilterDraft = { ...currentDraft };
        if (parsed.city) next.city = parsed.city;
        if (parsed.roomType) next.roomType = parsed.roomType;
        if (typeof parsed.participants === 'number')
          next.participants = String(parsed.participants);
        if (typeof parsed.maxHourlyPrice === 'number')
          next.priceMax = String(parsed.maxHourlyPrice);
        if (parsed.date) next.date = parsed.date;
        if (parsed.startTime) next.startTime = parsed.startTime;
        if (typeof parsed.durationMinutes === 'number')
          next.durationMinutes = String(parsed.durationMinutes);
        if (parsed.metroStation) {
          const station = metroStations.find(
            (s) => s.nameAz === parsed.metroStation,
          );
          if (station) next.metroStationId = station.id;
        }

        onApply(next);
        setVoiceState('done');
        setTimeout(() => setVoiceState('idle'), 1500);
      } catch (err) {
        console.error('[VoiceSearch] Pipeline error:', err);
        setErrorKey('voiceNetworkError');
        setVoiceState('error');
        setTimeout(() => setVoiceState('idle'), 3000);
      }
    },
    [metroStations, roomTypes, currentDraft, onApply],
  );

  function stopRecording() {
    // Enforce minimum 500ms recording time so the blob has actual audio data.
    const elapsed = Date.now() - recordingStartRef.current;
    if (elapsed < 500) {
      console.log('[VoiceSearch] Deferring stop — only', elapsed, 'ms recorded so far');
      setTimeout(() => stopRecording(), 500 - elapsed);
      return;
    }
    stopTimers();
    if (
      recorderRef.current &&
      recorderRef.current.state !== 'inactive'
    ) {
      recorderRef.current.stop();
    }
    stopStream();
  }

  async function startRecording() {
    const mimeType = getSupportedMimeType();
    console.log('[VoiceSearch] Detected MIME type:', mimeType || '(none — unsupported browser)');

    if (!mimeType) {
      // Browser doesn't support MediaRecorder with any known audio format
      setErrorKey('voiceError');
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 4000);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('[VoiceSearch] getUserMedia failed:', err);
      setErrorKey('voicePermissionError');
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 4000);
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
      console.log('[VoiceSearch] MediaRecorder created with mimeType:', mimeType);
    } catch (err) {
      console.warn('[VoiceSearch] MediaRecorder with mimeType failed, falling back:', err);
      try {
        recorder = new MediaRecorder(stream);
      } catch (err2) {
        console.error('[VoiceSearch] MediaRecorder creation failed entirely:', err2);
        stopStream();
        setErrorKey('voiceError');
        setVoiceState('error');
        setTimeout(() => setVoiceState('idle'), 3000);
        return;
      }
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
        console.log('[VoiceSearch] ondataavailable chunk:', e.data.size, 'bytes, total chunks:', chunksRef.current.length);
      }
    };

    recorder.onstop = () => {
      const effectiveMime =
        recorder.mimeType || mimeType || 'audio/webm';
      console.log('[VoiceSearch] recorder.onstop — effectiveMime:', effectiveMime, 'chunks:', chunksRef.current.length);
      void handleRecordingDone(chunksRef.current, effectiveMime);
      stopStream();
    };

    recorder.onerror = (ev) => {
      console.error('[VoiceSearch] recorder.onerror:', ev);
      stopTimers();
      stopStream();
      setErrorKey('voiceError');
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 3000);
    };

    recorder.start(100); // collect data every 100ms for better chunk reliability
    recordingStartRef.current = Date.now();
    setCountdown(MAX_RECORDING_SECONDS);
    setVoiceState('recording');
    console.log('[VoiceSearch] Recording started');

    // Countdown timer
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    // Auto-stop after MAX_RECORDING_SECONDS
    autoStopTimerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_SECONDS * 1000);
  }

  function handleClick() {
    if (voiceState === 'recording') {
      stopRecording();
      return;
    }
    if (voiceState === 'processing' || voiceState === 'done') return;

    void startRecording();
  }

  // Hide on desktop (md: and up) or if MediaRecorder not supported.
  if (!supported) return null;

  const isRecording = voiceState === 'recording';
  const isProcessing = voiceState === 'processing';
  const isDone = voiceState === 'done';
  const isError = voiceState === 'error';
  const isIdle = voiceState === 'idle';

  const ariaLabel = isRecording
    ? t('voiceRecording')
    : isProcessing
      ? t('voiceProcessing')
      : t('voiceSearch');

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={handleClick}
        disabled={isProcessing || isDone}
        aria-label={ariaLabel}
        className={[
          'flex items-center justify-center rounded-md border p-2.5 transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
          isRecording
            ? 'animate-pulse border-error bg-error/10 text-error'
            : isError
              ? 'border-error bg-error/10 text-error'
              : isDone
                ? 'border-success bg-success/10 text-success'
                : 'border-border bg-surface text-text-secondary hover:border-primary hover:text-primary',
          isProcessing || isDone ? 'opacity-60 cursor-not-allowed' : '',
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
        ) : isDone ? (
          /* Green check */
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 fill-none stroke-current stroke-2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          /* Microphone icon */
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 fill-none stroke-current stroke-2"
          >
            <rect
              x="9"
              y="2"
              width="6"
              height="12"
              rx="3"
              strokeLinejoin="round"
            />
            <path d="M5 10a7 7 0 0014 0" strokeLinecap="round" />
            <path d="M12 17v4" strokeLinecap="round" />
            <path d="M9 21h6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Tooltip / status label */}
      {(isRecording || isError || isIdle === false) && (
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
          {isError
            ? t(errorKey)
            : isRecording
              ? `${t('voiceRecording')} — ${t('voiceCountdown', { seconds: countdown })}`
              : isProcessing
                ? t('voiceProcessing')
                : null}
        </span>
      )}
    </div>
  );
}
