import { NextRequest, NextResponse } from 'next/server';

export interface VoiceParsedFilters {
  city?: string;
  metroStation?: string; // matched exactly to one of availableMetroStations
  roomType?: string;     // matched exactly to one of availableRoomTypes
  participants?: number;
  maxHourlyPrice?: number;
  date?: string;         // ISO date string YYYY-MM-DD
  startTime?: string;    // HH:mm format
  durationMinutes?: number;
}

interface VoiceParseRequest {
  transcript: string;
  availableMetroStations: string[];
  availableRoomTypes: string[];
}

// ---------------------------------------------------------------------------
// Normalisation helper — strips Azerbaijani diacritics and punctuation so
// that 'içəri şəhər' and 'İçərişəhər' both reduce to 'icerisehер' and can
// be substring-matched.
// ---------------------------------------------------------------------------
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/İ/g, 'i')
    .replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Priority 1: OpenAI directly from the BFF
// ---------------------------------------------------------------------------
async function openAiParser(
  transcript: string,
  availableMetroStations: string[],
  availableRoomTypes: string[],
): Promise<VoiceParsedFilters | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = (
    process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const model = process.env.AI_SEARCH_MODEL ?? 'gpt-4o-mini';

  if (!apiKey) return null;

  const systemPrompt = `Sen Spotva platforması üçün səs axtarış assistentisən.
İstifadəçinin səsli sorğusunu aşağıdakı filter strukturuna çevir.

Mövcud metro stansiyaları: ${availableMetroStations.join(', ')}
Mövcud otaq növləri: ${availableRoomTypes.join(', ')}

Yalnız aşağıdakı JSON formatında cavab ver, başqa heç nə yazma:
{
  "city": "Bakı" ya da null,
  "metroStation": "dəqiq metro adı siyahıdan" ya da null,
  "roomType": "dəqiq otaq növü siyahıdan" ya da null,
  "participants": rəqəm ya da null,
  "maxHourlyPrice": rəqəm ya da null,
  "date": "YYYY-MM-DD" ya da null,
  "startTime": "HH:mm" ya da null,
  "durationMinutes": rəqəm ya da null
}

Qayda: metroStation yalnız mövcud siyahıdan seçilə bilər. roomType yalnız mövcud siyahıdan seçilə bilər. Əmin olmadığın sahəni null qoy.`;

  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript.trim() },
        ],
        max_completion_tokens: 400,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Strip markdown fences if the model wrapped it
    const jsonStr = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const result: VoiceParsedFilters = {};

    if (typeof parsed.city === 'string' && parsed.city) result.city = parsed.city;

    if (typeof parsed.metroStation === 'string' && parsed.metroStation) {
      if (availableMetroStations.includes(parsed.metroStation)) {
        result.metroStation = parsed.metroStation;
      } else {
        // Fuzzy-validate the AI's answer against the list
        const aiNorm = normalize(parsed.metroStation);
        const match = availableMetroStations.find(
          (s) => normalize(s) === aiNorm,
        );
        if (match) result.metroStation = match;
      }
    }

    if (typeof parsed.roomType === 'string' && parsed.roomType) {
      if (availableRoomTypes.includes(parsed.roomType)) {
        result.roomType = parsed.roomType;
      } else {
        const aiNorm = normalize(parsed.roomType);
        const match = availableRoomTypes.find((rt) => normalize(rt) === aiNorm);
        if (match) result.roomType = match;
      }
    }

    if (typeof parsed.participants === 'number' && parsed.participants > 0 && parsed.participants <= 500) {
      result.participants = parsed.participants;
    }
    if (typeof parsed.maxHourlyPrice === 'number' && parsed.maxHourlyPrice > 0 && parsed.maxHourlyPrice <= 10000) {
      result.maxHourlyPrice = parsed.maxHourlyPrice;
    }
    if (typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
      result.date = parsed.date;
    }
    if (typeof parsed.startTime === 'string' && /^\d{2}:\d{2}$/.test(parsed.startTime)) {
      result.startTime = parsed.startTime;
    }
    if (typeof parsed.durationMinutes === 'number' && parsed.durationMinutes > 0 && parsed.durationMinutes <= 1440) {
      result.durationMinutes = parsed.durationMinutes;
    }

    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Priority 2: Backend /ai/search/interpret endpoint
// ---------------------------------------------------------------------------
async function backendAiParser(
  transcript: string,
  availableMetroStations: string[],
  availableRoomTypes: string[],
): Promise<VoiceParsedFilters | null> {
  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) return null;

  try {
    const res = await fetch(
      `${backendUrl.replace(/\/$/, '')}/ai/search/interpret`,
      {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: transcript, locale: 'az' }),
        cache: 'no-store',
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return null;

    // Backend returns SearchIntent — extract what we need.
    const data = (await res.json()) as {
      filters?: {
        city?: string;
        district?: string;
        roomType?: string;
        date?: string;
        startTime?: string;
        durationMinutes?: number;
        participants?: number;
        priceMax?: number; // in minor units (×100)
      };
    };

    if (!data?.filters) return null;
    const f = data.filters;
    const result: VoiceParsedFilters = {};

    if (f.city) result.city = f.city;
    if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) result.date = f.date;
    if (f.startTime && /^\d{2}:\d{2}$/.test(f.startTime)) result.startTime = f.startTime;
    if (f.durationMinutes && f.durationMinutes > 0) result.durationMinutes = f.durationMinutes;
    if (f.participants && f.participants > 0) result.participants = f.participants;
    if (typeof f.priceMax === 'number' && f.priceMax > 0) {
      result.maxHourlyPrice = Math.round(f.priceMax / 100);
    }

    // Map roomType (backend key) → available room type using fuzzy normalization
    if (f.roomType) {
      const rtNorm = normalize(f.roomType);
      const rtMatch = availableRoomTypes.find(
        (rt) => normalize(rt) === rtNorm || normalize(rt).includes(rtNorm) || rtNorm.includes(normalize(rt)),
      );
      if (rtMatch) result.roomType = rtMatch;
    }

    // Backend doesn't return metroStation — let regex fallback handle that
    const metroMatch = fuzzyMatchStation(transcript, availableMetroStations);
    if (metroMatch) result.metroStation = metroMatch;

    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Priority 3: Improved regex / fuzzy fallback parser for Azerbaijani speech.
// ---------------------------------------------------------------------------
function regexFallbackParser(
  transcript: string,
  availableMetroStations: string[],
  availableRoomTypes: string[],
): VoiceParsedFilters {
  const text = transcript.toLowerCase().trim();
  const result: VoiceParsedFilters = {};

  // participants: "N nəfər" or "N nəfərlik" or "N neferlik"
  const participantsMatch = text.match(/(\d+)\s*n[əe]f[əe]r/i);
  if (participantsMatch) {
    const n = parseInt(participantsMatch[1], 10);
    if (n > 0 && n <= 500) result.participants = n;
  }

  // maxHourlyPrice: "N manat" or "N AZN" or "N-dən ucuz"
  const priceMatch = text.match(/(\d+)\s*(manat|azn)/i);
  if (priceMatch) {
    const n = parseInt(priceMatch[1], 10);
    if (n > 0 && n <= 10000) result.maxHourlyPrice = n;
  }

  // date: "sabah" → tomorrow; "bu gün" or "bugün" → today
  const today = new Date();
  if (/sabah/.test(text)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    result.date = toIsoDate(tomorrow);
  } else if (/bu\s*g[uü]n/.test(text)) {
    result.date = toIsoDate(today);
  }

  // startTime: "saat N" or "saat N:MM"
  const timeMatch = text.match(/saat\s+(\d{1,2})(?::(\d{2}))?/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      result.startTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // durationMinutes: "N saatlıq" or "N saat" (duration context)
  const durationHourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*saat(?:l[ıi]q)?/i);
  const durationMinMatch = text.match(/(\d+)\s*d[əe]q/i);
  if (durationHourMatch) {
    const hours = parseFloat(durationHourMatch[1].replace(',', '.'));
    const mins = Math.round(hours * 60);
    if (mins > 0 && mins <= 1440) result.durationMinutes = mins;
  } else if (durationMinMatch) {
    const mins = parseInt(durationMinMatch[1], 10);
    if (mins > 0 && mins <= 1440) result.durationMinutes = mins;
  }

  // metro station: fuzzy normalize match
  const matchedStation = fuzzyMatchStation(transcript, availableMetroStations);
  if (matchedStation) result.metroStation = matchedStation;

  // room type: fuzzy normalize match then keyword fallback
  const matchedRoomType = fuzzyMatchRoomType(transcript, availableRoomTypes);
  if (matchedRoomType) result.roomType = matchedRoomType;

  return result;
}

// ---------------------------------------------------------------------------
// Fuzzy matching helpers (normalization-based)
// ---------------------------------------------------------------------------

/**
 * Matches metro station names using diacritic-normalized substring matching.
 * Handles 'içəri şəhərdə' → normalize → 'iceriseherde' containing 'icerisehер'.
 */
function fuzzyMatchStation(
  transcript: string,
  availableMetroStations: string[],
): string | undefined {
  const normTranscript = normalize(transcript);
  let best: string | undefined;
  let bestLen = 0;

  for (const station of availableMetroStations) {
    const normStation = normalize(station);
    if (normStation.length > 1 && normTranscript.includes(normStation) && normStation.length > bestLen) {
      best = station;
      bestLen = normStation.length;
    }
  }
  return best;
}

/** Azerbaijani keywords → room_type key fragments. */
const AZ_ROOM_TYPE_KEYWORDS: Array<{ keywords: string[]; keyFragment: string }> = [
  { keywords: ['iclaslar', 'iclas otağı', 'görüş otağı', 'görüs otagi', 'meeting'], keyFragment: 'meeting_room' },
  { keywords: ['konfrans', 'conference'], keyFragment: 'conference_room' },
  { keywords: ['biznes görüş', 'business meeting'], keyFragment: 'business_meeting_room' },
  { keywords: ['müsahibə', 'musahibe', 'intervyu', 'interview'], keyFragment: 'interview_room' },
  { keywords: ['təlim', 'telim', 'training'], keyFragment: 'training_room' },
  { keywords: ['sinif', 'dərs otağı', 'dərs otagi', 'classroom'], keyFragment: 'classroom' },
  { keywords: ['müəllim', 'muellim', 'repetitor', 'tutor'], keyFragment: 'tutor_teacher_room' },
  { keywords: ['seminar'], keyFragment: 'seminar_room' },
  { keywords: ['workshop', 'emalatxana'], keyFragment: 'workshop_space' },
  { keywords: ['kovorkinq', 'koworking', 'coworking', 'koüorking', 'iş masası', 'is masasi', 'desk'], keyFragment: 'coworking' },
  { keywords: ['xüsusi ofis', 'xususi ofis', 'private office', 'şəxsi ofis', 'sexsi ofis'], keyFragment: 'private_office' },
  { keywords: ['podcast', 'radio'], keyFragment: 'podcast_studio' },
  { keywords: ['foto', 'video studiyası', 'photo studio'], keyFragment: 'photo_video_studio' },
  { keywords: ['event', 'tədbir', 'teddir', 'mərasim', 'merasim'], keyFragment: 'event_space' },
];

function fuzzyMatchRoomType(
  transcript: string,
  availableRoomTypes: string[],
): string | undefined {
  const normTranscript = normalize(transcript);
  const transcriptLower = transcript.toLowerCase();

  // 1. Keyword mapping
  for (const { keywords, keyFragment } of AZ_ROOM_TYPE_KEYWORDS) {
    const matched = keywords.some(
      (kw) => transcriptLower.includes(kw.toLowerCase()) || normTranscript.includes(normalize(kw)),
    );
    if (matched) {
      const found = availableRoomTypes.find((rt) => normalize(rt).includes(normalize(keyFragment)));
      if (found) return found;
    }
  }

  // 2. Direct normalized substring match against available room types
  let best: string | undefined;
  let bestLen = 0;
  for (const rt of availableRoomTypes) {
    const normRt = normalize(rt);
    if (normRt.length > 1 && normTranscript.includes(normRt) && normRt.length > bestLen) {
      best = rt;
      bestLen = normRt.length;
    }
  }
  return best;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: VoiceParseRequest | null = null;
  try {
    body = (await request.json()) as VoiceParseRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body.transcript !== 'string') {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
  }

  const { transcript, availableMetroStations = [], availableRoomTypes = [] } = body;

  // Sanitise transcript — never log, never store.
  const sanitised = transcript.slice(0, 500);

  // Priority 1: OpenAI directly from BFF (uses OPENAI_API_KEY + OPENAI_API_BASE)
  const openAiResult = await openAiParser(sanitised, availableMetroStations, availableRoomTypes);
  if (openAiResult) {
    return NextResponse.json({ ...openAiResult, _parser: 'openai' });
  }

  // Priority 2: Backend AI parse endpoint (/ai/search/interpret)
  const backendResult = await backendAiParser(sanitised, availableMetroStations, availableRoomTypes);
  if (backendResult) {
    return NextResponse.json({ ...backendResult, _parser: 'backend-ai' });
  }

  // Priority 3: Improved fuzzy regex fallback
  const result = regexFallbackParser(sanitised, availableMetroStations, availableRoomTypes);
  return NextResponse.json({ ...result, _parser: 'regex' });
}
