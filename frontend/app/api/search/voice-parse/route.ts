import { NextRequest, NextResponse } from 'next/server';

export interface VoiceParsedFilters {
  city?: string;
  metroStation?: string; // matched exactly to one of availableMetroStations
  metroStationId?: string; // UUID from metro_stations table — use directly when available
  nearbyMetro?: boolean; // true when user expressed proximity ("yanında", "yaxınında")
  lat?: number; // PostGIS proximity: latitude of metro station or landmark
  lng?: number; // PostGIS proximity: longitude of metro station or landmark
  radiusKm?: number; // PostGIS proximity radius in km
  roomType?: string; // room_type.translation_key (e.g. "room_type.meeting_room")
  participants?: number;
  maxHourlyPrice?: number;
  date?: string; // ISO date string YYYY-MM-DD
  startTime?: string; // HH:mm format
  durationMinutes?: number;
}

interface VoiceParseRequest {
  transcript: string;
  availableMetroStations: string[];
  availableRoomTypes: string[];
}

// ---------------------------------------------------------------------------
// Normalisation helper — maps Azerbaijani diacritics to ASCII equivalents.
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
    .replace(/İ/g, 'i');
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Priority 1: Backend /ai/voice-parse (fetches DB data, calls OpenAI AI)
// ---------------------------------------------------------------------------
async function backendVoiceParser(
  transcript: string,
): Promise<VoiceParsedFilters | null> {
  const backendUrl = process.env.BACKEND_API_URL;
  if (!backendUrl) return null;

  try {
    const res = await fetch(
      `${backendUrl.replace(/\/$/, '')}/ai/voice-parse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
        signal: AbortSignal.timeout(12000),
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    if (!data || typeof data !== 'object') return null;

    const result: VoiceParsedFilters = {};
    if (typeof data.metroStation === 'string' && data.metroStation)
      result.metroStation = data.metroStation;
    if (typeof data.metroStationId === 'string' && data.metroStationId)
      result.metroStationId = data.metroStationId;
    if (data.nearbyMetro === true) result.nearbyMetro = true;
    if (typeof data.lat === 'number' && isFinite(data.lat)) result.lat = data.lat;
    if (typeof data.lng === 'number' && isFinite(data.lng)) result.lng = data.lng;
    if (typeof data.radiusKm === 'number' && data.radiusKm > 0) result.radiusKm = data.radiusKm;
    if (typeof data.roomType === 'string' && data.roomType)
      result.roomType = data.roomType;
    if (typeof data.participants === 'number' && data.participants > 0)
      result.participants = data.participants;
    if (typeof data.maxHourlyPrice === 'number' && data.maxHourlyPrice > 0)
      result.maxHourlyPrice = data.maxHourlyPrice;
    if (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date))
      result.date = data.date;
    if (
      typeof data.startTime === 'string' &&
      /^\d{2}:\d{2}$/.test(data.startTime)
    )
      result.startTime = data.startTime;
    if (
      typeof data.durationMinutes === 'number' &&
      data.durationMinutes > 0
    )
      result.durationMinutes = data.durationMinutes;

    // Return result if at least one field was parsed
    if (Object.keys(result).length > 0) return result;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Priority 2: Simple regex fallback parser for Azerbaijani speech
// ---------------------------------------------------------------------------
function regexFallbackParser(
  transcript: string,
  availableMetroStations: string[],
  availableRoomTypes: string[],
): VoiceParsedFilters {
  const text = transcript.toLowerCase().trim();
  const result: VoiceParsedFilters = {};

  // participants: "N nəfər" or "N nəfərlik"
  const participantsMatch = text.match(/(\d+)\s*n[əe]f[əe]r/i);
  if (participantsMatch) {
    const n = parseInt(participantsMatch[1], 10);
    if (n > 0 && n <= 500) result.participants = n;
  }

  // price: "N manat" or "N AZN"
  const priceMatch = text.match(/(\d+)\s*(manat|azn)/i);
  if (priceMatch) {
    const n = parseInt(priceMatch[1], 10);
    if (n > 0 && n <= 10000) result.maxHourlyPrice = n;
  }

  // date: "sabah" → tomorrow; "bu gün"/"bugün" → today
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

  // metro station: normalized substring match
  if (availableMetroStations.length > 0) {
    const normTranscript = normalize(transcript);
    let bestStation: string | undefined;
    let bestLen = 0;
    for (const station of availableMetroStations) {
      const normStation = normalize(station);
      const compactStation = normStation.replace(/\s+/g, '');
      const compactTranscript = normTranscript.replace(/\s+/g, '');
      let matched = false;
      if (compactStation.length > 1 && compactTranscript.includes(compactStation))
        matched = true;
      else if (normStation.length > 1 && normTranscript.includes(normStation))
        matched = true;
      else {
        const words = normStation.split(/\s+/).filter((w) => w.length >= 4);
        if (words.some((w) => normTranscript.includes(w))) matched = true;
      }
      if (matched && compactStation.length > bestLen) {
        bestStation = station;
        bestLen = compactStation.length;
      }
    }
    if (bestStation) result.metroStation = bestStation;
  }

  // room type: keyword mapping + normalized match
  if (availableRoomTypes.length > 0) {
    const KEYWORDS: Array<{ keywords: string[]; fragment: string }> = [
      { keywords: ['iclaslar', 'iclas', 'görüş', 'meeting'], fragment: 'meeting' },
      { keywords: ['konfrans', 'conference'], fragment: 'conference' },
      { keywords: ['müsahibə', 'intervyu', 'interview'], fragment: 'interview' },
      { keywords: ['təlim', 'training'], fragment: 'training' },
      { keywords: ['sinif', 'dərs', 'classroom'], fragment: 'classroom' },
      { keywords: ['seminar'], fragment: 'seminar' },
      { keywords: ['workshop', 'emalatxana'], fragment: 'workshop' },
      {
        keywords: ['kovorkinq', 'coworking', 'iş masası', 'desk'],
        fragment: 'coworking',
      },
      {
        keywords: ['xüsusi ofis', 'private office', 'şəxsi ofis'],
        fragment: 'private_office',
      },
      { keywords: ['podcast', 'radio'], fragment: 'podcast' },
      { keywords: ['foto', 'photo', 'video stud'], fragment: 'photo' },
      { keywords: ['event', 'tədbir', 'mərasim'], fragment: 'event' },
    ];
    const normTranscript = normalize(transcript);
    const transcriptLower = transcript.toLowerCase();
    for (const { keywords, fragment } of KEYWORDS) {
      const matched = keywords.some(
        (kw) =>
          transcriptLower.includes(kw.toLowerCase()) ||
          normTranscript.includes(normalize(kw)),
      );
      if (matched) {
        const found = availableRoomTypes.find((rt) =>
          normalize(rt).includes(normalize(fragment)),
        );
        if (found) {
          result.roomType = found;
          break;
        }
      }
    }
  }

  return result;
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
    return NextResponse.json(
      { error: 'transcript is required' },
      { status: 400 },
    );
  }

  const {
    transcript,
    availableMetroStations = [],
    availableRoomTypes = [],
  } = body;

  // Sanitise transcript — never log, never store.
  const sanitised = transcript.slice(0, 500);

  // Priority 1: Backend AI parse (uses DB reference data + OpenAI)
  const backendResult = await backendVoiceParser(sanitised);
  if (backendResult) {
    return NextResponse.json({ ...backendResult, _parser: 'backend-ai' });
  }

  // Priority 2: Simple regex fallback
  const result = regexFallbackParser(
    sanitised,
    availableMetroStations,
    availableRoomTypes,
  );
  return NextResponse.json({ ...result, _parser: 'regex' });
}
