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
// Simple regex/keyword fallback parser for Azerbaijani speech.
// Used when no AI backend is configured, or as a fallback on AI failure.
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

  // maxHourlyPrice: "N manat" or "N AZN" or "N azn" — also "N-dən ucuz"
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
  // "2 saatlıq" → 120, "1.5 saat" → 90, "30 dəqiqəlik" → 30
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

  // metro station: fuzzy match against availableMetroStations
  const matchedStation = fuzzyMatchList(text, availableMetroStations);
  if (matchedStation) result.metroStation = matchedStation;

  // room type: fuzzy match against availableRoomTypes (translation keys)
  const matchedRoomType = fuzzyMatchRoomType(text, availableRoomTypes);
  if (matchedRoomType) result.roomType = matchedRoomType;

  return result;
}

// ---------------------------------------------------------------------------
// Fuzzy match helpers
// ---------------------------------------------------------------------------

/** Returns the best matching item from the list if any word in the
 *  transcript appears as a substring of a list item (case-insensitive). */
function fuzzyMatchList(text: string, list: string[]): string | undefined {
  const normalised = text.toLowerCase();
  // Prefer longer matches to avoid false positives on short names.
  let best: string | undefined;
  let bestLen = 0;
  for (const item of list) {
    const itemLower = item.toLowerCase();
    if (normalised.includes(itemLower) && itemLower.length > bestLen) {
      best = item;
      bestLen = itemLower.length;
    }
  }
  return best;
}

/** Azerbaijani keywords → room_type translation key fragments.
 *  The transcript will contain Azerbaijani words; we map common phrases
 *  to the backend's room_type.* translation keys. */
const AZ_ROOM_TYPE_KEYWORDS: Array<{ keywords: string[]; keyFragment: string }> = [
  { keywords: ['iclaslar', 'iclas otağı', 'görüş otağı', 'meeting'], keyFragment: 'meeting_room' },
  { keywords: ['konfrans', 'conference'], keyFragment: 'conference_room' },
  { keywords: ['biznes görüş', 'business meeting'], keyFragment: 'business_meeting_room' },
  { keywords: ['müsahibə', 'intervyu', 'interview'], keyFragment: 'interview_room' },
  { keywords: ['təlim', 'training'], keyFragment: 'training_room' },
  { keywords: ['sinif', 'dərs otağı', 'classroom'], keyFragment: 'classroom' },
  { keywords: ['müəllim', 'müəllimlik', 'repetitor', 'tutor'], keyFragment: 'tutor_teacher_room' },
  { keywords: ['seminar'], keyFragment: 'seminar_room' },
  { keywords: ['workshop', 'emalatxana'], keyFragment: 'workshop_space' },
  { keywords: ['kovorkinq', 'coworking', 'iş masası', 'desk'], keyFragment: 'coworking_desk' },
  { keywords: ['xüsusi ofis', 'private office', 'şəxsi ofis'], keyFragment: 'private_office' },
  { keywords: ['podcast', 'radio'], keyFragment: 'podcast_studio' },
  { keywords: ['foto', 'video studiyası', 'photo studio'], keyFragment: 'photo_video_studio' },
  { keywords: ['event', 'tədbir', 'mərasim'], keyFragment: 'event_space' },
];

function fuzzyMatchRoomType(text: string, availableRoomTypes: string[]): string | undefined {
  const normalised = text.toLowerCase();
  for (const { keywords, keyFragment } of AZ_ROOM_TYPE_KEYWORDS) {
    const matched = keywords.some((kw) => normalised.includes(kw.toLowerCase()));
    if (matched) {
      // Find the exact translation key that contains this fragment.
      const found = availableRoomTypes.find((rt) => rt.includes(keyFragment));
      if (found) return found;
    }
  }
  // Also try direct substring match against translation key leafs.
  return fuzzyMatchList(text, availableRoomTypes);
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

  // Try backend AI parse endpoint if configured.
  const backendUrl = process.env.BACKEND_API_URL;
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl.replace(/\/$/, '')}/ai-search/parse`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: sanitised, availableMetroStations, availableRoomTypes }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const parsed = (await res.json()) as VoiceParsedFilters;
        // Validate that returned values are in the available lists.
        const validated: VoiceParsedFilters = { ...parsed };
        if (validated.metroStation && !availableMetroStations.includes(validated.metroStation)) {
          delete validated.metroStation;
        }
        if (validated.roomType && !availableRoomTypes.includes(validated.roomType)) {
          delete validated.roomType;
        }
        return NextResponse.json(validated);
      }
    } catch {
      // Fall through to regex fallback.
    }
  }

  // Regex fallback parser.
  const result = regexFallbackParser(sanitised, availableMetroStations, availableRoomTypes);
  return NextResponse.json(result);
}
