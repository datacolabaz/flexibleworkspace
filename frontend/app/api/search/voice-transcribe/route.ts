import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/search/voice-transcribe
 *
 * Accepts multipart/form-data with an `audio` field (webm or mp4 blob).
 *
 * Strategy:
 *  1. Forward to backend /ai/voice-transcribe (backend owns OPENAI_API_KEY).
 *  2. Fallback: call Whisper directly if OPENAI_API_KEY is set on the frontend env.
 *
 * The audio filename extension is derived from the blob's MIME type so Whisper
 * can correctly identify the codec (crucial for iOS Safari which records audio/mp4).
 *
 * Returns: { transcript: string } or { transcript: '', error: string } on failure.
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (err) {
    console.error('[voice-transcribe] Failed to parse form data:', err);
    return NextResponse.json(
      { transcript: '', error: 'invalid_form_data' },
      { status: 400 },
    );
  }

  const audioFile = formData.get('audio');
  if (!audioFile || !(audioFile instanceof Blob)) {
    console.error('[voice-transcribe] No audio file in request (field "audio" missing or not a Blob)');
    return NextResponse.json(
      { transcript: '', error: 'no_audio_file' },
      { status: 400 },
    );
  }

  // Derive the correct filename extension from the actual MIME type.
  // iOS Safari records audio/mp4 (AAC); Chrome/Firefox record audio/webm.
  // Whisper uses the file extension to select the decoder, so this is critical.
  const audioMime = audioFile.type || 'audio/webm';
  const audioExt = audioMime.includes('mp4') ? 'mp4' : 'webm';
  const audioFilename = `voice.${audioExt}`;

  console.log(
    `[voice-transcribe] received audio — type: ${audioMime}, size: ${audioFile.size} bytes, filename: ${audioFilename}`,
  );

  if (audioFile.size < 100) {
    console.warn('[voice-transcribe] Audio blob is suspiciously small (<100 bytes) — likely empty recording');
    return NextResponse.json({ transcript: '', error: 'empty_audio' });
  }

  // ── Path 1: Forward to backend /ai/voice-transcribe (backend owns the API key) ──
  const backendUrl = process.env.BACKEND_API_URL;
  if (backendUrl) {
    try {
      const backendForm = new FormData();
      backendForm.append('audio', audioFile, audioFilename);

      const endpoint = `${backendUrl.replace(/\/$/, '')}/ai/voice-transcribe`;
      console.log(`[voice-transcribe] forwarding to backend: ${endpoint}`);

      const res = await fetch(endpoint, {
        method: 'POST',
        body: backendForm,
        signal: AbortSignal.timeout(35000),
        cache: 'no-store',
      });

      if (res.ok) {
        const data = (await res.json()) as {
          transcript?: string;
          error?: string;
        };
        console.log(
          `[voice-transcribe] backend response — transcript: "${data.transcript}", error: ${data.error ?? 'none'}`,
        );
        if (data.transcript) {
          return NextResponse.json({ transcript: data.transcript });
        }
        // Backend responded but transcript is empty (silent audio, etc.)
        return NextResponse.json({
          transcript: '',
          error: data.error || 'empty_transcript',
        });
      } else {
        const errText = await res.text().catch(() => '(unreadable)');
        console.error(`[voice-transcribe] backend returned HTTP ${res.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[voice-transcribe] backend request failed:', err);
    }
  } else {
    console.warn('[voice-transcribe] BACKEND_API_URL is not set — skipping backend path');
  }

  // ── Path 2: Call Whisper directly if OPENAI_API_KEY is available on frontend ──
  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = (
    process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'
  ).replace(/\/$/, '');

  if (apiKey) {
    try {
      console.log('[voice-transcribe] attempting direct Whisper call');
      const whisperForm = new FormData();
      whisperForm.append('file', audioFile, audioFilename);
      whisperForm.append('model', 'whisper-1');
      whisperForm.append('language', 'az');
      whisperForm.append('response_format', 'text');

      const res = await fetch(`${apiBase}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: whisperForm,
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      });

      if (res.ok) {
        const transcript = (await res.text()).trim();
        console.log(`[voice-transcribe] Whisper direct result: "${transcript}"`);
        return NextResponse.json({ transcript });
      } else {
        const errText = await res.text().catch(() => '(unreadable)');
        console.error(`[voice-transcribe] Whisper returned HTTP ${res.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[voice-transcribe] Whisper direct request failed:', err);
    }
  } else {
    console.warn('[voice-transcribe] OPENAI_API_KEY not set on frontend — skipping direct Whisper path');
  }

  console.error('[voice-transcribe] All transcription paths exhausted — returning error');
  return NextResponse.json({ transcript: '', error: 'transcription_failed' });
}
