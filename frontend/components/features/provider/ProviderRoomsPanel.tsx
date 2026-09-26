'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { LocationPickerMap, type LocationPickerMapHandle } from './LocationPickerMap';
import { geocodeAddress, reverseGeocodeCoords, GeocodeRateLimitedError } from '@/lib/maps/geocodeAddress';
import azMessages from '@/messages/az.json';

type MetroStation = { id: string; nameAz: string; line: number; lineColor: string };
import type {
  AvailabilityRule,
  AvailabilityRuleInput,
  CreateLocationInput,
  MediaCapabilities,
  MyLocation,
  MyRoom,
  MyRoomAmenity,
  MyRoomStatus,
  RoomMedia,
  RoomMediaPhoto,
  RoomTypeOption,
} from '@/lib/api-client/provider-rooms';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

// Default map center: Baku, Azerbaijan (per 09_DOMAIN_MODEL.md and
// the provider onboarding spec: lat 40.4093, lng 49.8671).
const DEFAULT_LAT = 40.4093;
const DEFAULT_LNG = 49.8671;

const ROOM_TYPE_LABEL_AZ: Record<string, string> = {
  'room_type.meeting_room': 'İclas otağı',
  'room_type.coworking_desk': 'Coworking masası',
  'room_type.private_office': 'Fərdi ofis',
  'room_type.training_room': 'Təlim otağı',
  'room_type.classroom': 'Sinif otağı',
  'room_type.workshop_space': 'Emalatxana sahəsi',
  'room_type.seminar_room': 'Seminar otağı',
  'room_type.conference_room': 'Konfrans otağı',
  'room_type.podcast_studio': 'Podkast studiyası',
  'room_type.photo_video_studio': 'Foto və video studiyası',
  'room_type.event_space': 'Tədbir məkanı',
  'room_type.business_meeting_room': 'Biznes iclas otağı',
  'room_type.interview_room': 'Müsahibə otağı',
  'room_type.tutor_teacher_room': 'Dərs otağı',
};

const AMENITY_LABEL_AZ: Record<string, string> = {
  'amenity.wifi': 'Wi-Fi',
  'amenity.projector': 'Proyektor',
  'amenity.whiteboard': 'Ağ lövhə',
  'amenity.tv_screen': 'TV ekranı',
  'amenity.video_conferencing': 'Video konfrans',
  'amenity.sound_system': 'Səs sistemi',
  'amenity.soundproofing': 'Səsizolyasiya',
  'amenity.lighting_kit': 'İşıqlandırma dəsti',
  'amenity.air_conditioning': 'Kondisioner',
  'amenity.natural_light': 'Təbii işıq',
  'amenity.coffee_tea': 'Çay və qəhvə',
  'amenity.kitchen_access': 'Mətbəxdən istifadə',
  'amenity.parking': 'Avtodayanacaq',
  'amenity.wheelchair_accessible': 'Əlil arabası üçün əlçatan',
  'amenity.near_metro': 'Metroya yaxın',
  'amenity.reception_staff': 'Qarşılama heyəti',
  'amenity.printer_scanner': 'Printer / skaner',
  'amenity.private_entrance': 'Ayrıca giriş',
};

// 0=Sunday..6=Saturday, matching AvailabilityRuleEntity.dayOfWeek.
const DAY_LABEL_AZ: string[] = [
  'Bazar',
  'Bazar ertəsi',
  'Çərşənbə axşamı',
  'Çərşənbə',
  'Cümə axşamı',
  'Cümə',
  'Şənbə',
];

const STATUS_LABEL: Record<MyRoomStatus, string> = {
  DRAFT: 'Qaralama',
  ACTIVE: 'Aktiv',
  INACTIVE: 'Deaktiv',
};

const STATUS_TONE: Record<MyRoomStatus, string> = {
  DRAFT: 'bg-warning-bg text-warning',
  ACTIVE: 'bg-success-bg text-success',
  INACTIVE: 'bg-surface-elevated text-text-secondary',
};

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Drag-and-drop always hands the browser a File with `.type` correctly
// resolved from the OS (Finder/Explorer already knows each file's kind).
// A file picked through the native <input type="file"> dialog isn't
// guaranteed the same treatment — some OS/browser combinations (seen with
// Chrome on macOS for certain PNG/JPEG files, depending on how the file
// was created — a screenshot, an export from another app, a cloud-synced
// copy) leave `file.type` as an empty string, and the strict
// `file.type.startsWith('image/')` check below then rejected a perfectly
// valid image with no visible reason: same photo worked by dragging it
// into the exact same dropzone, silently failed by clicking + choosing
// it. Falling back to the file's extension when the browser didn't
// supply a MIME type closes that gap without loosening the check for
// files that do report a (wrong, non-image) type.
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i;

function isLikelyImageFile(file: File): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXTENSION_PATTERN.test(file.name);
}

const EXTENSION_MIME_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  avif: 'image/avif',
};

// Same empty-`file.type` gap as isLikelyImageFile above, but here it
// matters for a second reason: this resolved value is sent to BOTH the
// presign request and the actual PUT's Content-Type header, and they
// have to agree with each other regardless of what the browser reported
// — an empty string in one and something else in the other is exactly
// how an S3-compatible PUT ends up signature-mismatched.
function resolveImageMimeType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return (extension && EXTENSION_MIME_TYPE[extension]) || 'application/octet-stream';
}

async function readBffError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as BffErrorBody;
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
}

/**
 * Sprint 5 — provider self-service room creation. There was previously
 * NO way for a provider to list a room at all from the frontend (only
 * the backend API existed) — this closes that gap: create a business
 * address on first use (a room needs a `locationId`, and registering as
 * a provider doesn't create one), then add rooms with photos, then
 * activate them once the provider account is verified.
 *
 * Provider Listing Media Specification — `mediaCapabilities` (this
 * provider's plan-tier photo/video limits, fetched once server-side)
 * flows down to every room's media manager rather than each one
 * re-fetching it, since the limits are the same for every room this
 * provider owns.
 */
export function ProviderRoomsPanel({
  initialLocations,
  initialRooms,
  roomTypes,
  amenityOptions,
  mediaCapabilities,
}: {
  initialLocations: MyLocation[];
  initialRooms: MyRoom[];
  roomTypes: RoomTypeOption[];
  amenityOptions: RoomTypeOption[];
  mediaCapabilities: MediaCapabilities;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [rooms, setRooms] = useState(initialRooms);

  if (locations.length === 0) {
    return <LocationSetupCard onCreated={(location) => setLocations([location])} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <LocationCard location={locations[0]} onUpdated={(location) => setLocations([location])} />
      <RoomsCard
        locationId={locations[0].id}
        rooms={rooms}
        roomTypes={roomTypes}
        amenityOptions={amenityOptions}
        mediaCapabilities={mediaCapabilities}
        onCreated={(room) => setRooms((prev) => [room, ...prev])}
        onUpdated={(room) => setRooms((prev) => prev.map((item) => (item.id === room.id ? room : item)))}
        onDeleted={(roomId) => setRooms((prev) => prev.filter((item) => item.id !== roomId))}
      />
    </div>
  );
}

function LocationSetupCard({ onCreated }: { onCreated: (location: MyLocation) => void }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">Biznes ünvanı</h3>
        <p className="mt-1 text-small text-text-secondary">
          Otaq əlavə etməzdən əvvəl məkanınızın ünvanını və dəqiq xəritə mövqeyini təyin edin — müştərilər axtarış
          və otaq səhifələrindəki xəritədə sizi məhz bu nöqtədə görəcək.
        </p>
      </div>
      <LocationForm
        submitLabel="Davam et"
        onSubmit={(input) =>
          fetch('/api/provider/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          })
        }
        onSaved={onCreated}
      />
    </Card>
  );
}

/**
 * Shared by `LocationSetupCard` (first-time create) and `LocationCard`
 * (editing an already-created location) — same fields, same map picker,
 * only the submit target differs (POST vs PATCH), passed in as
 * `onSubmit` rather than duplicating the form twice.
 *
 * Full geocoding/map flow (per provider onboarding spec):
 *  - Forward geocoding fires 400 ms after addressLine changes (debounced),
 *    moves the pin + updates lat/lng in form state.
 *  - Reverse geocoding fires on every marker drag-end or map click,
 *    updates the addressLine input with the closest found address.
 *  - A `suppressForwardGeocodeRef` flag breaks the potential forward ↔
 *    reverse feedback loop: when reverse geocoding writes addressLine,
 *    the next forward-geocode effect run is skipped, then the flag resets.
 *  - "not found" / rate-limit / generic API error messages come from
 *    azMessages.locationPicker (never hardcoded).
 */
function LocationForm({
  initial,
  submitLabel,
  onSubmit,
  onSaved,
  onCancel,
}: {
  initial?: MyLocation;
  submitLabel: string;
  onSubmit: (input: CreateLocationInput) => Promise<Response>;
  onSaved: (location: MyLocation) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [city, setCity] = useState(initial?.city ?? 'Bakı');
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? '');
  const [lat, setLat] = useState(initial?.lat ?? DEFAULT_LAT);
  const [lng, setLng] = useState(initial?.lng ?? DEFAULT_LNG);
  const [nearestMetroStationId, setNearestMetroStationId] = useState<string>(
    initial?.nearestMetroStationId ?? '',
  );
  const [metroStations, setMetroStations] = useState<MetroStation[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeHint, setGeocodeHint] = useState<'not_found' | 'rate_limited' | 'error' | null>(null);
  const mapHandleRef = useRef<LocationPickerMapHandle>(null);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Load metro stations once (best-effort; empty list = field hidden).
  useEffect(() => {
    fetch('/api/metro-stations')
      .then((r) => r.ok ? r.json() : [])
      .then((data: MetroStation[]) => { if (Array.isArray(data)) setMetroStations(data); })
      .catch(() => { /* silent */ });
  }, []);

  /**
   * Prevents the addressLine → forward-geocode → recenter cycle from
   * re-triggering when the address was just written by reverse geocoding
   * (not by the user). Set to `true` immediately before calling
   * `setAddressLine` from the reverse-geocode path; the forward-geocode
   * effect resets it to `false` on its next run so subsequent
   * user keystrokes are geocoded normally.
   */
  const suppressForwardGeocodeRef = useRef(false);

  /** AbortController for the in-flight reverse-geocode request. */
  const reverseGeocodeAbortRef = useRef<AbortController | null>(null);

  // ── Forward geocoding (address → map pin) ────────────────────────────
  // Fires 400 ms after the provider stops typing in the address field.
  // Requires at least 4 characters so we don't jump the pin to the
  // middle of Bakı the instant the form opens with the default city.
  useEffect(() => {
    if (!mapboxToken) return undefined;

    // If this addressLine change came from reverse geocoding, skip this
    // run and reset the suppression flag for future user keystrokes.
    if (suppressForwardGeocodeRef.current) {
      suppressForwardGeocodeRef.current = false;
      return undefined;
    }

    const query = [addressLine.trim(), city.trim()].filter(Boolean).join(', ');
    if (addressLine.trim().length < 4) {
      setGeocodeHint(null);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setGeocoding(true);
      setGeocodeHint(null);
      geocodeAddress(query, mapboxToken, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (!result) {
            setGeocodeHint('not_found');
            return;
          }
          setLat(result.lat);
          setLng(result.lng);
          mapHandleRef.current?.recenter(result.lat, result.lng);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          if (err instanceof GeocodeRateLimitedError) {
            setGeocodeHint('rate_limited');
          } else {
            console.error('Address geocoding failed:', err);
            setGeocodeHint('error');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setGeocoding(false);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addressLine, city, mapboxToken]);

  // ── Reverse geocoding (map pin → address) ───────────────────────────
  // Called when the provider drags the marker or clicks on the map.
  // Cancels any prior in-flight reverse-geocode before starting a new one.
  function handleMapChange(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);

    if (!mapboxToken) return;

    reverseGeocodeAbortRef.current?.abort();
    const controller = new AbortController();
    reverseGeocodeAbortRef.current = controller;

    reverseGeocodeCoords(newLat, newLng, mapboxToken, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result) {
          // Flag must be set immediately before the state update so the
          // forward-geocode effect sees it on the resulting re-render.
          suppressForwardGeocodeRef.current = true;
          setAddressLine(result.placeName);
          setGeocodeHint(null);
        }
        // No "not found" hint for reverse geocoding — the pin position is
        // already accepted; a missing address name is just a silent no-op.
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Reverse geocoding errors are non-critical (the lat/lng is already
        // saved); log but don't surface to the user.
        console.error('Reverse geocoding failed:', err);
      });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const response = await onSubmit({
        name: name.trim(),
        city: city.trim(),
        addressLine: addressLine.trim(),
        lat,
        lng,
        nearestMetroStationId: nearestMetroStationId || null,
      });
      if (!response.ok) {
        setError(await readBffError(response, 'Ünvan yadda saxlanmadı. Yenidən cəhd edin.'));
        return;
      }
      onSaved((await response.json()) as MyLocation);
    } catch {
      setError('Ünvan yadda saxlanmadı. Yenidən cəhd edin.');
    } finally {
      setSaving(false);
    }
  }

  // ── Geocoding hint text shown below the map ──────────────────────────
  let mapHintText: string;
  if (geocoding) {
    mapHintText = azMessages.locationPicker.geocodingInProgress;
  } else if (geocodeHint === 'not_found') {
    mapHintText = azMessages.locationPicker.geocodeNotFound;
  } else if (geocodeHint === 'rate_limited') {
    mapHintText = azMessages.locationPicker.geocodeRateLimited;
  } else if (geocodeHint === 'error') {
    mapHintText = azMessages.locationPicker.geocodeError;
  } else {
    mapHintText = azMessages.locationPicker.markerInstructions;
  }

  const hintIsWarning = geocodeHint !== null && !geocoding;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 sm:max-w-sm">
      {error && <Alert variant="error">{error}</Alert>}
      <FormField id="location-name" label="Filialın adı">
        <Input id="location-name" required value={name} disabled={saving} onChange={(event) => setName(event.target.value)} placeholder="Məs. Əsas ofis" />
      </FormField>
      <FormField id="location-city" label="Şəhər">
        <Input id="location-city" required value={city} disabled={saving} onChange={(event) => setCity(event.target.value)} />
      </FormField>
      <FormField id="location-address" label="Ünvan">
        <Input id="location-address" required value={addressLine} disabled={saving} onChange={(event) => setAddressLine(event.target.value)} placeholder="Küçə, bina" />
      </FormField>
      {metroStations.length > 0 && (
        <FormField id="location-metro" label="Yaxın metro stansiyası" hint="İstəyə bağlı — müştərilər üçün naviqasiyaya kömək edir.">
          <Select
            id="location-metro"
            value={nearestMetroStationId}
            disabled={saving}
            onChange={(event) => setNearestMetroStationId(event.target.value)}
          >
            <option value="">Metro stansiyası seçin (istəyə bağlı)</option>
            <optgroup label="Xətt 1 — Qırmızı">
              {metroStations.filter((s) => s.line === 1).map((s) => (
                <option key={s.id} value={s.id}>{s.nameAz}</option>
              ))}
            </optgroup>
            <optgroup label="Xətt 2 — Yaşıl">
              {metroStations.filter((s) => s.line === 2).map((s) => (
                <option key={s.id} value={s.id}>{s.nameAz}</option>
              ))}
            </optgroup>
          </Select>
        </FormField>
      )}
      <FormField id="location-map" label="Məkanı xəritədə seçin">
        <LocationPickerMap
          ref={mapHandleRef}
          lat={lat}
          lng={lng}
          onChange={handleMapChange}
          className="h-64 w-full"
        />
        <p className={['mt-1.5 text-caption', hintIsWarning ? 'text-warning' : 'text-text-muted'].join(' ')}>
          {mapHintText}
        </p>
      </FormField>
      <div className="flex gap-3">
        <Button type="submit" isLoading={saving} className="self-start">
          {saving ? 'Saxlanılır…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Ləğv et
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Shows the current business address/pin with an "edit" toggle — before
 * this there was no frontend path to change a location at all once
 * created, so a location made while `DEFAULT_LOCATION_LAT`/`LNG` was
 * still the only option (or with the wrong address) had no way to be
 * corrected. Uses the same `LocationForm` as first-time setup, pointed
 * at the update endpoint instead of create.
 */
function LocationCard({ location, onUpdated }: { location: MyLocation; onUpdated: (location: MyLocation) => void }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <Card className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-h4 text-text-primary">Biznes ünvanı</h3>
          <p className="text-small text-text-secondary">
            {location.name} · {location.addressLine}, {location.city}
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" className="self-start sm:self-auto" onClick={() => setEditing(true)}>
          Ünvanı / xəritəni redaktə et
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h3 className="font-display text-h4 text-text-primary">Ünvanı redaktə et</h3>
      <LocationForm
        initial={location}
        submitLabel="Yadda saxla"
        onSubmit={(input) =>
          fetch(`/api/provider/locations/${location.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
          })
        }
        onSaved={(updated) => {
          onUpdated(updated);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    </Card>
  );
}

function RoomsCard({
  locationId,
  rooms,
  roomTypes,
  amenityOptions,
  mediaCapabilities,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  locationId: string;
  rooms: MyRoom[];
  roomTypes: RoomTypeOption[];
  amenityOptions: RoomTypeOption[];
  mediaCapabilities: MediaCapabilities;
  onCreated: (room: MyRoom) => void;
  onUpdated: (room: MyRoom) => void;
  onDeleted: (roomId: string) => void;
}) {
  const [showForm, setShowForm] = useState(rooms.length === 0);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-h4 text-text-primary">Otaqlarım</h3>
          <p className="text-small text-text-secondary">Stüdiya, podkast otağı və ya coworking masası əlavə edin.</p>
        </div>
        {!showForm && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(true)}>
            + Yeni otaq
          </Button>
        )}
      </div>

      {showForm && (
        <AddRoomForm
          locationId={locationId}
          roomTypes={roomTypes}
          amenityOptions={amenityOptions}
          onCreated={(room) => {
            onCreated(room);
            setShowForm(false);
          }}
          onCancel={rooms.length > 0 ? () => setShowForm(false) : undefined}
        />
      )}

      {rooms.length === 0 && !showForm && <p className="text-small text-text-muted">Hələ heç bir otaq əlavə etməmisiniz.</p>}

      {rooms.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              roomTypes={roomTypes}
              amenityOptions={amenityOptions}
              mediaCapabilities={mediaCapabilities}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AddRoomForm({
  locationId,
  roomTypes,
  amenityOptions,
  onCreated,
  onCancel,
}: {
  locationId: string;
  roomTypes: RoomTypeOption[];
  amenityOptions: RoomTypeOption[];
  onCreated: (room: MyRoom) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState('');
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [capacityMax, setCapacityMax] = useState('4');
  const [minBookingMinutes, setMinBookingMinutes] = useState('60');
  const [maxBookingMinutes, setMaxBookingMinutes] = useState('');
  const [price, setPrice] = useState('');
  const [selectedAmenityIds, setSelectedAmenityIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function toggleAmenity(id: string) {
    setSelectedAmenityIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Məkan adını daxil edin.');
      return;
    }
    if (!roomTypeId) {
      setError('Kateqoriya seçin.');
      return;
    }
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      setError('Saatlıq qiymət 0-dan böyük olmalıdır.');
      return;
    }
    if (!Number.isInteger(Number(capacityMax)) || Number(capacityMax) < 1) {
      setError('Maksimum tutum ən azı 1 olmalıdır.');
      return;
    }
    const minMins = minBookingMinutes ? Number(minBookingMinutes) : undefined;
    const maxMins = maxBookingMinutes ? Number(maxBookingMinutes) : undefined;
    if (minMins !== undefined && (!Number.isInteger(minMins) || minMins < 30)) {
      setError('Minimum bron müddəti ən azı 30 dəqiqə olmalıdır.');
      return;
    }
    if (maxMins !== undefined && minMins !== undefined && maxMins < minMins) {
      setError('Maksimum bron müddəti minimumdən az ola bilməz.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch('/api/provider/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          roomTypeId,
          name: name.trim(),
          description: description.trim() || undefined,
          rules: rules.trim() || undefined,
          capacityMax: Number(capacityMax),
          basePriceAmount: Math.round(Number(price) * 100),
          amenityIds: selectedAmenityIds.length > 0 ? selectedAmenityIds : undefined,
          minBookingMinutes: minMins,
          maxBookingMinutes: maxMins,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        setError(
          body?.error?.code === 'PLAN_LIMIT_REACHED'
            ? 'FREE planda yalnız 1 otaq əlavə edə bilərsiniz. Daha çox otaq üçün "Planım" bölməsindən Pro-ya keçid sorğusu göndərin.'
            : (body?.error?.message ?? 'Otaq yaradılmadı. Yenidən cəhd edin.'),
        );
        return;
      }
      onCreated((await response.json()) as MyRoom);
    } catch {
      setError('Otaq yaradılmadı. Yenidən cəhd edin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-md border border-border p-4">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Step 1 — Məkan adı */}
      <FormField id="room-name" label="Məkan adı" hint="Müştərilərin görəcəyi otaq adı.">
        <Input id="room-name" required value={name} disabled={saving} onChange={(event) => setName(event.target.value)} placeholder="Məs. Podkast Studiyası A" />
      </FormField>

      {/* Step 2 — Kateqoriya */}
      <FormField id="room-type" label="Kateqoriya" hint="Otağın növünü siyahıdan seçin.">
        <Select id="room-type" value={roomTypeId} disabled={saving} onChange={(event) => setRoomTypeId(event.target.value)}>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {ROOM_TYPE_LABEL_AZ[rt.translationKey] ?? rt.translationKey}
            </option>
          ))}
        </Select>
      </FormField>

      {/* Step 3 — Qısa təsvir */}
      <FormField id="room-description" label="Qısa təsvir (istəyə bağlı)" hint="Avadanlıq, ab-hava, xüsusiyyətlər.">
        <textarea
          id="room-description"
          rows={3}
          value={description}
          disabled={saving}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Otağınız haqqında qısa məlumat — avadanlıq, ab-hava, xüsusiyyətlər"
          className="w-full min-h-24 rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </FormField>

      {/* Task 1 — Qaydalar (rules/policies) */}
      <FormField id="room-rules" label="Qaydalar" hint="Məkan istifadə qaydalarını daxil edin (istifadəçilər bron etməzdən əvvəl görəcək)">
        <textarea
          id="room-rules"
          rows={3}
          value={rules}
          disabled={saving}
          onChange={(event) => setRules(event.target.value)}
          placeholder="məs. Siqaret qadağandır. Səs-küy limiti: 22:00-dan sonra sakitlik."
          className="w-full min-h-24 rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </FormField>

      {/* Steps 4 (photos) and 5 (address+map) are managed in separate panels below */}

      {/* Step 6 — Tutum */}
      <FormField id="room-capacity" label="Tutum (maksimum nəfər sayı)" hint="Eyni anda bu otaqda neçə nəfər ola bilər.">
        <Input id="room-capacity" type="number" min="1" required value={capacityMax} disabled={saving} onChange={(event) => setCapacityMax(event.target.value)} />
      </FormField>

      {/* Step 7 — Saatlıq qiymət */}
      <FormField id="room-price" label="Saatlıq qiymət (AZN)" hint="Bir saatlıq bron üçün əsas qiymət.">
        <Input id="room-price" type="number" min="0.01" step="0.01" required value={price} disabled={saving} onChange={(event) => setPrice(event.target.value)} />
      </FormField>

      {/* Step 8 — Bron müddəti (min/max) */}
      <div className="grid grid-cols-2 gap-4">
        <FormField id="room-min-booking" label="Min. bron (dəq, istəyə bağlı)" hint="Standart: 60 dəq.">
          <Input id="room-min-booking" type="number" min="30" step="30" value={minBookingMinutes} disabled={saving} onChange={(event) => setMinBookingMinutes(event.target.value)} placeholder="60" />
        </FormField>
        <FormField id="room-max-booking" label="Maks. bron (dəq, istəyə bağlı)" hint="Boş qoyulsa, limit yoxdur.">
          <Input id="room-max-booking" type="number" min="30" step="30" value={maxBookingMinutes} disabled={saving} onChange={(event) => setMaxBookingMinutes(event.target.value)} placeholder="—" />
        </FormField>
      </div>

      {/* Amenities — inline at creation, also editable separately in AmenitiesEditor */}
      <FormField id="room-amenities" label="Amenitlər (könüllü)" hint="Otaqda mövcud olan imkanları seçin.">
        <div id="room-amenities" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {amenityOptions.map((amenity) => (
            <label key={amenity.id} className="flex min-h-11 items-center gap-2 text-small text-text-primary">
              <input
                type="checkbox"
                checked={selectedAmenityIds.includes(amenity.id)}
                disabled={saving}
                onChange={() => toggleAmenity(amenity.id)}
                className="h-4 w-4 rounded-sm border-border-strong text-primary focus:ring-primary"
              />
              {AMENITY_LABEL_AZ[amenity.translationKey] ?? amenity.translationKey}
            </label>
          ))}
        </div>
      </FormField>

      <div className="flex gap-3">
        <Button type="submit" isLoading={saving}>
          {saving ? 'Yaradılır…' : 'Otağı yarat'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Ləğv et
          </Button>
        )}
      </div>
    </form>
  );
}

function EditRoomForm({
  room,
  roomTypes,
  onSaved,
  onCancel,
  onDelete,
}: {
  room: MyRoom;
  roomTypes: RoomTypeOption[];
  onSaved: (room: MyRoom) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(room.name);
  const [roomTypeId, setRoomTypeId] = useState(room.roomTypeId);
  const [description, setDescription] = useState(room.description ?? '');
  const [rules, setRules] = useState(room.rules ?? '');
  const [capacityMax, setCapacityMax] = useState(String(room.capacityMax));
  const [minBookingMinutes, setMinBookingMinutes] = useState(room.minBookingMinutes ? String(room.minBookingMinutes) : '');
  const [maxBookingMinutes, setMaxBookingMinutes] = useState(room.maxBookingMinutes ? String(room.maxBookingMinutes) : '');
  const [price, setPrice] = useState(String(Number(room.basePriceAmount) / 100));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomTypeId) {
      setError('Kateqoriya seçin.');
      return;
    }
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      setError('Saatlıq qiymət 0-dan böyük olmalıdır.');
      return;
    }
    if (!Number.isInteger(Number(capacityMax)) || Number(capacityMax) < 1) {
      setError('Maksimum tutum ən azı 1 olmalıdır.');
      return;
    }
    const minMins = minBookingMinutes ? Number(minBookingMinutes) : undefined;
    const maxMins = maxBookingMinutes ? Number(maxBookingMinutes) : undefined;
    if (minMins !== undefined && (!Number.isInteger(minMins) || minMins < 30)) {
      setError('Minimum bron müddəti ən azı 30 dəqiqə olmalıdır.');
      return;
    }
    if (maxMins !== undefined && minMins !== undefined && maxMins < minMins) {
      setError('Maksimum bron müddəti minimumdən az ola bilməz.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${room.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: room.locationId,
          roomTypeId,
          name: name.trim(),
          description: description.trim() || undefined,
          rules: rules.trim() || undefined,
          capacityMin: room.capacityMin,
          capacityMax: Number(capacityMax),
          basePriceAmount: Math.round(Number(price) * 100),
          basePriceCurrency: room.basePriceCurrency,
          minBookingMinutes: minMins,
          maxBookingMinutes: maxMins,
        }),
      });
      if (!response.ok) {
        setError(await readBffError(response, 'Otaq yadda saxlanmadı. Yenidən cəhd edin.'));
        return;
      }
      onSaved((await response.json()) as MyRoom);
    } catch {
      setError('Otaq yadda saxlanmadı. Yenidən cəhd edin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Step 1 — Məkan adı */}
      <FormField id={`edit-room-name-${room.id}`} label="Məkan adı" hint="Müştərilərin görəcəyi otaq adı.">
        <Input
          id={`edit-room-name-${room.id}`}
          required
          value={name}
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>

      {/* Step 2 — Kateqoriya */}
      <FormField id={`edit-room-type-${room.id}`} label="Kateqoriya" hint="Otağın növünü siyahıdan seçin.">
        <Select
          id={`edit-room-type-${room.id}`}
          value={roomTypeId}
          disabled={saving}
          onChange={(event) => setRoomTypeId(event.target.value)}
        >
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {ROOM_TYPE_LABEL_AZ[rt.translationKey] ?? rt.translationKey}
            </option>
          ))}
        </Select>
      </FormField>

      {/* Step 3 — Qısa təsvir */}
      <FormField id={`edit-room-description-${room.id}`} label="Qısa təsvir (istəyə bağlı)" hint="Avadanlıq, ab-hava, xüsusiyyətlər.">
        <textarea
          id={`edit-room-description-${room.id}`}
          rows={3}
          value={description}
          disabled={saving}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full min-h-24 rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </FormField>

      {/* Task 1 — Qaydalar (rules/policies) */}
      <FormField id={`edit-room-rules-${room.id}`} label="Qaydalar" hint="Məkan istifadə qaydalarını daxil edin (istifadəçilər bron etməzdən əvvəl görəcək)">
        <textarea
          id={`edit-room-rules-${room.id}`}
          rows={3}
          value={rules}
          disabled={saving}
          onChange={(event) => setRules(event.target.value)}
          placeholder="məs. Siqaret qadağandır. Səs-küy limiti: 22:00-dan sonra sakitlik."
          className="w-full min-h-24 rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
      </FormField>

      {/* Step 6 — Tutum */}
      <FormField id={`edit-room-capacity-${room.id}`} label="Tutum (maksimum nəfər sayı)" hint="Eyni anda bu otaqda neçə nəfər ola bilər.">
        <Input
          id={`edit-room-capacity-${room.id}`}
          type="number"
          min="1"
          required
          value={capacityMax}
          disabled={saving}
          onChange={(event) => setCapacityMax(event.target.value)}
        />
      </FormField>

      {/* Step 7 — Saatlıq qiymət */}
      <FormField id={`edit-room-price-${room.id}`} label="Saatlıq qiymət (AZN)" hint="Bir saatlıq bron üçün əsas qiymət.">
        <Input
          id={`edit-room-price-${room.id}`}
          type="number"
          min="0.01"
          step="0.01"
          required
          value={price}
          disabled={saving}
          onChange={(event) => setPrice(event.target.value)}
        />
      </FormField>

      {/* Step 8 — Bron müddəti (min/max) */}
      <div className="grid grid-cols-2 gap-4">
        <FormField id={`edit-room-min-booking-${room.id}`} label="Min. bron (dəq, istəyə bağlı)" hint="Standart: 60 dəq.">
          <Input
            id={`edit-room-min-booking-${room.id}`}
            type="number"
            min="30"
            step="30"
            value={minBookingMinutes}
            disabled={saving}
            onChange={(event) => setMinBookingMinutes(event.target.value)}
            placeholder="60"
          />
        </FormField>
        <FormField id={`edit-room-max-booking-${room.id}`} label="Maks. bron (dəq, istəyə bağlı)" hint="Boş qoyulsa, limit yoxdur.">
          <Input
            id={`edit-room-max-booking-${room.id}`}
            type="number"
            min="30"
            step="30"
            value={maxBookingMinutes}
            disabled={saving}
            onChange={(event) => setMaxBookingMinutes(event.target.value)}
            placeholder="—"
          />
        </FormField>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" isLoading={saving}>
          {saving ? 'Yadda saxlanılır…' : 'Yadda saxla'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Ləğv et
        </Button>
        <Button type="button" variant="secondary" onClick={onDelete} disabled={saving}>
          Elanı sil
        </Button>
      </div>
    </form>
  );
}

function RoomRow({
  room,
  roomTypes,
  amenityOptions,
  mediaCapabilities,
  onUpdated,
  onDeleted,
}: {
  room: MyRoom;
  roomTypes: RoomTypeOption[];
  amenityOptions: RoomTypeOption[];
  mediaCapabilities: MediaCapabilities;
  onUpdated: (room: MyRoom) => void;
  onDeleted: (roomId: string) => void;
}) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Auto-opens the edit form when arriving via the room detail page's
  // "Bu sizin elanınızdır" banner (`/provider#room-{id}`) — landing here
  // and still having to find the right room and click "Redaktə et" again
  // would defeat the point of that link.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === `#room-${room.id}`) {
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roomType = roomTypes.find((rt) => rt.id === room.roomTypeId);
  const roomTypeLabel = roomType ? ROOM_TYPE_LABEL_AZ[roomType.translationKey] ?? roomType.translationKey : '—';

  async function setStatus(status: MyRoomStatus) {
    setStatusBusy(true);
    setStatusError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${room.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        setStatusError(
          body?.error?.code === 'PROVIDER_NOT_VERIFIED'
            ? "Otağı aktivləşdirmək üçün əvvəlcə hesabınız təsdiqlənməlidir (yuxarıdakı 'Doğrulama sənədləri' bölümünə baxın)."
            : body?.error?.code === 'ROOM_NO_PHOTOS'
              ? 'Otağı aktivləşdirmək üçün əvvəlcə ən azı bir şəkil əlavə edin (aşağıdakı şəkil bölümü).'
              : (body?.error?.message ?? 'Status dəyişdirilmədi. Yenidən cəhd edin.'),
        );
        return;
      }
      onUpdated((await response.json()) as MyRoom);
    } catch {
      setStatusError('Status dəyişdirilmədi. Yenidən cəhd edin.');
    } finally {
      setStatusBusy(false);
    }
  }

  async function deleteRoom() {
    if (!window.confirm(`“${room.name}” elanını silmək istədiyinizə əminsiniz?`)) return;
    setDeleteBusy(true);
    setStatusError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${room.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as BffErrorBody | undefined;
        setStatusError(body?.error?.message ?? 'Elan silinmədi. Yenidən cəhd edin.');
        return;
      }
      onDeleted(room.id);
    } catch {
      setStatusError('Elan silinmədi. Yenidən cəhd edin.');
    } finally {
      setDeleteBusy(false);
    }
  }

  if (editing) {
    return (
      <li id={`room-${room.id}`} className="scroll-mt-6 flex flex-col gap-3 rounded-md border border-border p-4">
        <EditRoomForm
          room={room}
          roomTypes={roomTypes}
          onSaved={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onDelete={deleteRoom}
        />
      </li>
    );
  }

  return (
    <li id={`room-${room.id}`} className="scroll-mt-6 flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-body font-semibold text-text-primary">{room.name}</p>
          <p className="text-small text-text-secondary">
            {roomTypeLabel} · {room.capacityMin}–{room.capacityMax} nəfər · {(Number(room.basePriceAmount) / 100).toFixed(2)} {room.basePriceCurrency}/saat
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-caption ${STATUS_TONE[room.status]}`}>{STATUS_LABEL[room.status]}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Redaktə et
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={deleteBusy} onClick={deleteRoom}>
            {deleteBusy ? 'Silinir…' : 'Elanı sil'}
          </Button>
        </div>
      </div>

      {statusError && <Alert variant="error">{statusError}</Alert>}
      {room.status === 'DRAFT' && (
        <div>
          <p className="text-caption text-text-muted">Bu otaq hələ ictimai görünmür — aktivləşdirənə qədər axtarışda çıxmayacaq.</p>
          <Button type="button" size="sm" className="mt-2" disabled={statusBusy} onClick={() => setStatus('ACTIVE')}>
            Aktivləşdir
          </Button>
        </div>
      )}
      {room.status === 'ACTIVE' && (
        <Button type="button" variant="secondary" size="sm" className="self-start" disabled={statusBusy} onClick={() => setStatus('INACTIVE')}>
          Deaktiv et
        </Button>
      )}
      {room.status === 'INACTIVE' && (
        <Button type="button" size="sm" className="self-start" disabled={statusBusy} onClick={() => setStatus('ACTIVE')}>
          Yenidən aktivləşdir
        </Button>
      )}

      <div className="border-t border-border pt-3">
        <AmenitiesEditor
          roomId={room.id}
          amenityOptions={amenityOptions}
          currentAmenities={room.amenities}
          onUpdated={onUpdated}
        />
      </div>

      <div className="border-t border-border pt-3">
        <AvailabilityEditor roomId={room.id} />
      </div>

      <div className="border-t border-border pt-3">
        <RoomMediaManager roomId={room.id} capabilities={mediaCapabilities} />
      </div>
    </li>
  );
}

/**
 * Lets a provider set/change which amenities a room has, directly from
 * the dashboard — before this there was NO frontend path to set
 * amenities on an existing room at all (only `RoomInputDto.amenityIds`
 * existed on the backend, wired only into room creation). Uses the
 * narrow `PATCH :roomId/amenities` endpoint (full-replace on just this
 * relation) rather than the general room PATCH, which nulls out any
 * omitted optional field.
 */
function AmenitiesEditor({
  roomId,
  amenityOptions,
  currentAmenities,
  onUpdated,
}: {
  roomId: string;
  amenityOptions: RoomTypeOption[];
  currentAmenities: MyRoomAmenity[];
  onUpdated: (room: MyRoom) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(currentAmenities.map((a) => a.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setSaved(false);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }

  async function handleSave() {
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/amenities`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amenityIds: selectedIds }),
      });
      if (!response.ok) {
        setError(await readBffError(response, 'Amenitlər yadda saxlanmadı. Yenidən cəhd edin.'));
        return;
      }
      onUpdated((await response.json()) as MyRoom);
      setSaved(true);
    } catch {
      setError('Amenitlər yadda saxlanmadı. Yenidən cəhd edin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-label text-text-primary" id={`room-amenities-${roomId}`}>
        Amenitlər
      </label>
      {error && <Alert variant="error">{error}</Alert>}
      <div aria-labelledby={`room-amenities-${roomId}`} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {amenityOptions.map((amenity) => (
          <label key={amenity.id} className="flex min-h-11 items-center gap-2 text-small text-text-primary">
            <input
              type="checkbox"
              checked={selectedIds.includes(amenity.id)}
              disabled={saving}
              onChange={() => toggle(amenity.id)}
              className="h-4 w-4 rounded-sm border-border-strong text-primary focus:ring-primary"
            />
            {AMENITY_LABEL_AZ[amenity.translationKey] ?? amenity.translationKey}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" size="sm" isLoading={saving} onClick={handleSave} className="self-start">
          {saving ? 'Saxlanılır…' : 'Amenitləri yadda saxla'}
        </Button>
        {saved && <span className="text-caption text-success">Saxlanıldı ✓</span>}
      </div>
    </div>
  );
}

type WeeklyDay = {
  dayOfWeek: number;
  isOpen: boolean;
  startTime: string;
  endTime: string;
};

const DEFAULT_OPEN_START = '09:00';
const DEFAULT_OPEN_END = '21:00';

function buildWeekFromRules(rules: AvailabilityRule[]): WeeklyDay[] {
  return DAY_LABEL_AZ.map((_, dayOfWeek) => {
    const rule = rules.find((r) => r.recurrenceType === 'WEEKLY' && r.dayOfWeek === dayOfWeek);
    if (!rule) {
      return { dayOfWeek, isOpen: false, startTime: DEFAULT_OPEN_START, endTime: DEFAULT_OPEN_END };
    }
    return {
      dayOfWeek,
      isOpen: rule.isOpen,
      startTime: rule.startTime.slice(0, 5),
      endTime: rule.endTime.slice(0, 5),
    };
  });
}

/**
 * Root fix for "rezerv etmək olmur" (can't reserve) — a room has zero
 * bookable time until working hours are set somewhere, and before this
 * there was NO frontend UI anywhere that let a provider set them (only
 * the backend's `PUT :roomId/availability-rules` existed, and nothing
 * could even read back what was saved — the paired GET was added
 * alongside this UI). One WEEKLY rule per day of week, open/closed
 * toggle plus a start/end time when open.
 *
 * Loads lazily on first expand rather than on mount — every `RoomRow`
 * in the list would otherwise fire its own availability-rules GET the
 * moment the dashboard renders, on top of `RoomMediaManager`'s own
 * on-mount fetch for every room; there's no need to pay for that before
 * the provider has actually asked to see or edit the hours.
 */
function AvailabilityEditor({ roomId }: { roomId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [week, setWeek] = useState<WeeklyDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  async function handleExpand() {
    setExpanded(true);
    if (week) return;
    setLoading(true);
    setLoadError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/availability-rules`, { cache: 'no-store' });
      if (!response.ok) {
        setLoadError(await readBffError(response, 'İş saatları yüklənmədi.'));
        return;
      }
      const rules = (await response.json()) as AvailabilityRule[];
      setWeek(buildWeekFromRules(rules));
    } catch {
      setLoadError('İş saatları yüklənmədi.');
    } finally {
      setLoading(false);
    }
  }

  function updateDay(dayOfWeek: number, patch: Partial<WeeklyDay>) {
    setSaved(false);
    setWeek((prev) => prev && prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day)));
  }

  async function handleSave() {
    if (!week) return;
    if (week.every((day) => !day.isOpen)) {
      setSaveError('Otağın rezerv edilə bilməsi üçün ən azı bir gün açıq olmalıdır.');
      return;
    }
    for (const day of week) {
      if (day.isOpen && day.startTime >= day.endTime) {
        setSaveError(`${DAY_LABEL_AZ[day.dayOfWeek]} üçün bitmə vaxtı başlanğıc vaxtından sonra olmalıdır.`);
        return;
      }
    }
    setSaving(true);
    setSaveError(undefined);
    setSaved(false);
    try {
      const rules: AvailabilityRuleInput[] = week.map((day) => ({
        recurrenceType: 'WEEKLY',
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        isOpen: day.isOpen,
      }));
      const response = await fetch(`/api/provider/rooms/${roomId}/availability-rules`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      if (!response.ok) {
        setSaveError(await readBffError(response, 'İş saatları yadda saxlanmadı. Yenidən cəhd edin.'));
        return;
      }
      const savedRules = (await response.json()) as AvailabilityRule[];
      setWeek(buildWeekFromRules(savedRules));
      setSaved(true);
    } catch {
      setSaveError('İş saatları yadda saxlanmadı. Yenidən cəhd edin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="text-label text-text-primary">İş saatları</label>
        <p className="text-caption text-text-muted">
          Otaq yalnız aşağıda açıq işarələnmiş günlərdə və saatlarda rezerv üçün görünəcək.
        </p>
      </div>

      {!expanded && (
        <Button type="button" variant="secondary" size="sm" onClick={handleExpand} className="self-start">
          İş saatlarını göstər / redaktə et
        </Button>
      )}

      {expanded && loadError && <Alert variant="error">{loadError}</Alert>}
      {expanded && saveError && <Alert variant="error">{saveError}</Alert>}

      {expanded && loading && <Spinner label="Yüklənir" />}

      {expanded && week && (
        <div className="flex flex-col gap-1.5">
          {week.map((day) => (
            <div key={day.dayOfWeek} className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label className="flex min-h-11 w-36 shrink-0 items-center gap-2 text-small text-text-primary">
                <input
                  type="checkbox"
                  checked={day.isOpen}
                  disabled={saving}
                  onChange={(event) => updateDay(day.dayOfWeek, { isOpen: event.target.checked })}
                  className="h-4 w-4 rounded-sm border-border-strong text-primary focus:ring-primary"
                />
                {DAY_LABEL_AZ[day.dayOfWeek]}
              </label>
              <input
                type="time"
                aria-label={`${DAY_LABEL_AZ[day.dayOfWeek]} başlanğıc`}
                value={day.startTime}
                disabled={saving || !day.isOpen}
                onChange={(event) => updateDay(day.dayOfWeek, { startTime: event.target.value })}
                className="min-h-9 rounded-sm border border-border-strong bg-surface px-2 py-1 text-small text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-small text-text-muted">—</span>
              <input
                type="time"
                aria-label={`${DAY_LABEL_AZ[day.dayOfWeek]} bitmə`}
                value={day.endTime}
                disabled={saving || !day.isOpen}
                onChange={(event) => updateDay(day.dayOfWeek, { endTime: event.target.value })}
                className="min-h-9 rounded-sm border border-border-strong bg-surface px-2 py-1 text-small text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          ))}
          <div className="mt-1 flex items-center gap-3">
            <Button type="button" size="sm" isLoading={saving} onClick={handleSave} className="self-start">
              {saving ? 'Saxlanılır…' : 'İş saatlarını yadda saxla'}
            </Button>
            {saved && <span className="text-caption text-success">Saxlanıldı ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Provider Listing Media Specification — photo grid (upload, remove,
 * reorder, set cover) plus a Pro-only video section, all for one room.
 *
 * Upload path depends on `capabilities.directUploadSupported`: when the
 * backend runs on S3/R2 it's the 3-step presign → PUT-to-storage →
 * confirm dance (file bytes never touch this app's own server); when it
 * doesn't (local dev without S3 credentials), photos fall back to the
 * legacy multipart endpoint and video is simply unavailable (there is no
 * server-side video path that doesn't go through direct upload).
 */
function RoomMediaManager({ roomId, capabilities }: { roomId: string; capabilities: MediaCapabilities }) {
  const [media, setMedia] = useState<RoomMedia | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | undefined>();
  const [videoBusy, setVideoBusy] = useState(false);

  const loadMedia = useCallback(async () => {
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/media`, { cache: 'no-store' });
      if (!response.ok) {
        setLoadError(await readBffError(response, 'Şəkillər yüklənmədi.'));
        return;
      }
      setMedia((await response.json()) as RoomMedia);
    } catch {
      setLoadError('Şəkillər yüklənmədi.');
    }
  }, [roomId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const photoCount = media?.photos.length ?? 0;
  const photoLimitReached = photoCount >= capabilities.maxImageCount;

  async function uploadOnePhoto(file: File): Promise<void> {
    if (capabilities.directUploadSupported) {
      const mimeType = resolveImageMimeType(file);
      const presignRes = await fetch(`/api/provider/rooms/${roomId}/media/photos/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFilename: file.name, mimeType }),
      });
      if (!presignRes.ok) throw new Error(await readBffError(presignRes, 'Şəkil yüklənmədi.'));
      const { uploadUrl, storageKey } = (await presignRes.json()) as { uploadUrl: string; storageKey: string };

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
      });
      if (!putRes.ok) throw new Error('Şəkil saxlama xidmətinə yüklənmədi. Yenidən cəhd edin.');

      const confirmRes = await fetch(`/api/provider/rooms/${roomId}/media/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey }),
      });
      if (!confirmRes.ok) {
        const body = (await confirmRes.json().catch(() => undefined)) as BffErrorBody | undefined;
        // The backend verifies the object actually landed in storage before
        // recording it (server-side HEAD check) — surface a clear retry
        // message here instead of the backend's English one, since this is
        // the one failure a slow/dropped connection can genuinely cause.
        throw new Error(
          body?.error?.code === 'PHOTO_UPLOAD_INCOMPLETE'
            ? 'Şəkil yaddaşa tam yüklənmədi (bağlantı kəsilmiş ola bilər). Yenidən cəhd edin.'
            : (body?.error?.message ?? 'Şəkil yaddaşa yazılmadı.'),
        );
      }
    } else {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/provider/rooms/${roomId}/photos`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await readBffError(response, 'Şəkil yüklənmədi.'));
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setPhotoError(undefined);

    const remaining = capabilities.maxImageCount - photoCount;
    if (remaining <= 0) {
      setPhotoError(`Bu plan üzrə ən çoxu ${capabilities.maxImageCount} şəkil əlavə edə bilərsiniz.`);
      return;
    }
    const toUpload = list.slice(0, remaining);
    if (list.length > toUpload.length) {
      setPhotoError(`Bu plan üzrə ən çoxu ${capabilities.maxImageCount} şəkil əlavə edə bilərsiniz — yalnız ilk ${toUpload.length} şəkil yükləndi.`);
    }

    for (const file of toUpload) {
      if (!isLikelyImageFile(file)) {
        setPhotoError('Yalnız şəkil faylı yükləyin (JPG və ya PNG).');
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoError('Şəkil 8MB-dan kiçik olmalıdır.');
        continue;
      }
      setPhotoUploading(true);
      try {
        await uploadOnePhoto(file);
      } catch (error) {
        setPhotoError(error instanceof Error ? error.message : 'Şəkil yüklənmədi. Yenidən cəhd edin.');
      } finally {
        setPhotoUploading(false);
      }
    }
    await loadMedia();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    event.target.value = '';
    if (files && files.length > 0) void handleFiles(files);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingOver(false);
    if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files);
  }

  async function handleRemovePhoto(photoId: string) {
    setBusyPhotoId(photoId);
    setPhotoError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/media/photos/${photoId}`, { method: 'DELETE' });
      if (!response.ok) {
        setPhotoError(await readBffError(response, 'Şəkil silinmədi. Yenidən cəhd edin.'));
        return;
      }
      const photos = (await response.json()) as RoomMediaPhoto[];
      setMedia((prev) => (prev ? { ...prev, photos } : prev));
    } catch {
      setPhotoError('Şəkil silinmədi. Yenidən cəhd edin.');
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function handleSetCover(photoId: string) {
    setBusyPhotoId(photoId);
    setPhotoError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/media/photos/${photoId}/cover`, { method: 'PATCH' });
      if (!response.ok) {
        setPhotoError(await readBffError(response, 'Üz qabığı seçilmədi. Yenidən cəhd edin.'));
        return;
      }
      const photos = (await response.json()) as RoomMediaPhoto[];
      setMedia((prev) => (prev ? { ...prev, photos } : prev));
    } catch {
      setPhotoError('Üz qabığı seçilmədi. Yenidən cəhd edin.');
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function handleMove(photoId: string, direction: -1 | 1) {
    if (!media) return;
    const ordered = [...media.photos].sort((a, b) => a.displayOrder - b.displayOrder);
    const index = ordered.findIndex((p) => p.id === photoId);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return;
    [ordered[index], ordered[swapWith]] = [ordered[swapWith], ordered[index]];
    const photoIds = ordered.map((p) => p.id);

    setBusyPhotoId(photoId);
    setPhotoError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/media/photos/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds }),
      });
      if (!response.ok) {
        setPhotoError(await readBffError(response, 'Sıralama dəyişdirilmədi. Yenidən cəhd edin.'));
        return;
      }
      const photos = (await response.json()) as RoomMediaPhoto[];
      setMedia((prev) => (prev ? { ...prev, photos } : prev));
    } catch {
      setPhotoError('Sıralama dəyişdirilmədi. Yenidən cəhd edin.');
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function handleVideoFile(file: File) {
    setVideoError(undefined);
    if (!file.type.startsWith('video/')) {
      setVideoError('Yalnız video faylı yükləyin.');
      return;
    }
    if (file.size > capabilities.maxVideoSizeBytes) {
      setVideoError(`Video ${formatMegabytes(capabilities.maxVideoSizeBytes)}-dan kiçik olmalıdır.`);
      return;
    }

    setVideoUploading(true);
    try {
      const duration = await readVideoDuration(file);
      if (duration > capabilities.maxVideoDurationSeconds) {
        setVideoError(`Video ${capabilities.maxVideoDurationSeconds} saniyədən qısa olmalıdır.`);
        return;
      }

      const presignRes = await fetch(`/api/provider/rooms/${roomId}/media/video/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFilename: file.name, mimeType: file.type }),
      });
      if (!presignRes.ok) throw new Error(await readBffError(presignRes, 'Video yüklənmədi.'));
      const { uploadUrl, storageKey } = (await presignRes.json()) as { uploadUrl: string; storageKey: string };

      const putRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!putRes.ok) throw new Error('Video saxlama xidmətinə yüklənmədi. Yenidən cəhd edin.');

      const confirmRes = await fetch(`/api/provider/rooms/${roomId}/media/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey, durationSeconds: Math.round(duration), mimeType: file.type }),
      });
      if (!confirmRes.ok) throw new Error(await readBffError(confirmRes, 'Video yaddaşa yazılmadı.'));
      await loadMedia();
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : 'Video yüklənmədi. Yenidən cəhd edin.');
    } finally {
      setVideoUploading(false);
    }
  }

  async function handleRemoveVideo() {
    setVideoBusy(true);
    setVideoError(undefined);
    try {
      const response = await fetch(`/api/provider/rooms/${roomId}/media/video`, { method: 'DELETE' });
      if (!response.ok) {
        setVideoError(await readBffError(response, 'Video silinmədi. Yenidən cəhd edin.'));
        return;
      }
      await loadMedia();
    } catch {
      setVideoError('Video silinmədi. Yenidən cəhd edin.');
    } finally {
      setVideoBusy(false);
    }
  }

  const orderedPhotos = media ? [...media.photos].sort((a, b) => a.displayOrder - b.displayOrder) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* -- Photos ------------------------------------------------------ */}
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <label className="text-label text-text-primary" id={`room-photos-${roomId}`}>
            Şəkillər{media && <span className="text-caption font-normal text-text-muted"> ({photoCount}/{capabilities.maxImageCount})</span>}
          </label>
        </div>

        {loadError && <Alert variant="error" className="mb-2">{loadError}</Alert>}
        {photoError && <Alert variant="error" className="mb-2">{photoError}</Alert>}

        {orderedPhotos.length > 0 && (
          <ul
            aria-labelledby={`room-photos-${roomId}`}
            className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5"
          >
            {orderedPhotos.map((photo, index) => (
              <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface-elevated">
                {/* eslint-disable-next-line @next/next/no-img-element -- provider-uploaded photo URL from our own storage provider, not a fixed domain set next/image's allowlist assumes (matches RoomGallery/RoomListingCard's own choice). */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
                {photo.isCover && (
                  <Badge variant="accent" className="absolute left-1.5 top-1.5">
                    Üz qabığı
                  </Badge>
                )}
                {busyPhotoId === photo.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-surface/70">
                    <Spinner label="Yenilənir" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-gradient-to-t from-black/60 to-transparent p-1">
                  <IconButton
                    aria-label="Sola daşı"
                    disabled={index === 0 || busyPhotoId !== null}
                    onClick={() => handleMove(photo.id, -1)}
                    className="h-7 w-7 bg-surface/90 text-text-primary hover:bg-surface"
                  >
                    ←
                  </IconButton>
                  {!photo.isCover && (
                    <IconButton
                      aria-label="Üz qabığı et"
                      disabled={busyPhotoId !== null}
                      onClick={() => handleSetCover(photo.id)}
                      className="h-7 w-7 bg-surface/90 text-text-primary hover:bg-surface"
                    >
                      ★
                    </IconButton>
                  )}
                  <IconButton
                    aria-label="Şəkli sil"
                    disabled={busyPhotoId !== null}
                    onClick={() => handleRemovePhoto(photo.id)}
                    className="h-7 w-7 bg-surface/90 text-error hover:bg-surface"
                  >
                    ✕
                  </IconButton>
                  <IconButton
                    aria-label="Sağa daşı"
                    disabled={index === orderedPhotos.length - 1 || busyPhotoId !== null}
                    onClick={() => handleMove(photo.id, 1)}
                    className="h-7 w-7 bg-surface/90 text-text-primary hover:bg-surface"
                  >
                    →
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!photoLimitReached && (
          <label
            htmlFor={`room-photo-input-${roomId}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors ${
              isDraggingOver ? 'border-primary bg-primary/5' : 'border-border-strong hover:border-primary'
            }`}
          >
            {photoUploading ? (
              <Spinner label="Yüklənir" />
            ) : (
              <>
                <p className="text-small font-medium text-text-primary">Şəkil əlavə etmək üçün klikləyin və ya bura sürükləyin</p>
                <p className="text-caption text-text-muted">JPG və ya PNG, maksimum 8MB. 3–5 aydın, işıqlı şəkil tövsiyə olunur.</p>
              </>
            )}
            <input
              id={`room-photo-input-${roomId}`}
              type="file"
              accept="image/*"
              multiple
              disabled={photoUploading}
              onChange={handleInputChange}
              className="sr-only"
            />
          </label>
        )}
        {photoLimitReached && (
          <p className="text-caption text-text-muted">
            Bu plan üzrə maksimum şəkil sayına çatmısınız ({capabilities.maxImageCount}). Daha çox şəkil üçün planınızı yüksəldin.
          </p>
        )}
      </div>

      {/* -- Video --------------------------------------------------------- */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-label text-text-primary">
          Video
          {!capabilities.videoAllowed && <Badge variant="neutral">PRO</Badge>}
        </label>

        {!capabilities.videoAllowed && (
          <p className="text-caption text-text-muted">
            Otağa video əlavə etmək yalnız Pro planda mövcuddur (maks. 30 saniyə, 20MB). Planınızı yüksəldərək bu
            otağa qısa bir tanıtım videosu əlavə edə bilərsiniz.
          </p>
        )}

        {capabilities.videoAllowed && !capabilities.directUploadSupported && (
          <p className="text-caption text-text-muted">Video yükləmə hazırda mövcud deyil.</p>
        )}

        {capabilities.videoAllowed && capabilities.directUploadSupported && (
          <>
            {videoError && <Alert variant="error" className="mb-2">{videoError}</Alert>}

            {media?.video ? (
              <div className="flex flex-col gap-2 sm:max-w-xs">
                <video controls src={media.video.url} className="w-full rounded-md border border-border" />
                <Button type="button" variant="secondary" size="sm" isLoading={videoBusy} onClick={handleRemoveVideo} className="self-start">
                  {videoBusy ? 'Silinir…' : 'Videonu sil'}
                </Button>
              </div>
            ) : (
              <label className="flex flex-col gap-1.5 text-label text-text-primary">
                <input
                  type="file"
                  accept="video/*"
                  disabled={videoUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void handleVideoFile(file);
                  }}
                  className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-label file:text-accent-on disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="text-caption font-normal text-text-muted">
                  {videoUploading
                    ? 'Yüklənir…'
                    : `Maksimum ${capabilities.maxVideoDurationSeconds} saniyə, ${formatMegabytes(capabilities.maxVideoSizeBytes)}.`}
                </span>
              </label>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Reads a video file's duration client-side (before upload) — the backend can't verify duration without downloading/probing the file, so this is the only duration check that happens before bytes leave the browser (the server re-checks the value reported here, and independently verifies the actual uploaded SIZE via a HEAD request). */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(videoEl.src);
      resolve(videoEl.duration);
    };
    videoEl.onerror = () => {
      URL.revokeObjectURL(videoEl.src);
      reject(new Error('Video oxuna bilmədi. Fayl zədələnmiş ola bilər.'));
    };
    videoEl.src = URL.createObjectURL(file);
  });
}
