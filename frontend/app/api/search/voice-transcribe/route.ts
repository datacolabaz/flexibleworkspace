import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/search/voice-transcribe
 *
 * Accepts multipart/form-data with an `audio` field (webm or mp4 blob).
 *
 * Strategy:
 *  1. If OPENAI_API_KEY is set in the frontend server env, call Whisper directly.
 *  2. Otherwise forward the audio blob to the backend /ai/voice-transcribe endpoint.
 *
 * Returns: { transcript: string } or { transcript: '', error: string } on failure.
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { transcript: '', error: 'invalid_form_data' },
      { status: 400 },
    );
  }

  const audioFile = formData.get('audio');
  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json(
      { transcript: '', error: 'no_audio_file' },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = (
    process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'
  ).replace(/\/$/, '');

  // ── Path 1: Call Whisper directly if we have the key ─────────────────────
  if (apiKey) {
    try {
      const whisperForm = new FormData();
      whisperForm.append('file', audioFile, 'voice.webm');
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
        return NextResponse.json({ transcript });
      }
    } catch {
      // fall through to backend path
    }
  }

  // ── Path 2: Forward to backend /ai/voice-transcribe ──────────────────────
  const backendUrl = process.env.BACKEND_API_URL;
  if (backendUrl) {
    try {
      const backendForm = new FormData();
      backendForm.append('audio', audioFile, 'voice.webm');

      const res = await fetch(
        `${backendUrl.replace(/\/$/, '')}/ai/voice-transcribe`,
        {
          method: 'POST',
          body: backendForm,
          signal: AbortSignal.timeout(35000),
          cache: 'no-store',
        },
      );

      if (res.ok) {
        const data = (await res.json()) as {
          transcript?: string;
          error?: string;
        };
        if (data.transcript) {
          return NextResponse.json({ transcript: data.transcript });
        }
      }
    } catch {
      // fall through to error
    }
  }

  return NextResponse.json({ transcript: '', error: 'transcription_failed' });
}
