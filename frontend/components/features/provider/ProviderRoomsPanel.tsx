'use client';

import { useCallback, useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import type {
  MediaCapabilities,
  MyLocation,
  MyRoom,
  MyRoomStatus,
  RoomMedia,
  RoomMediaPhoto,
  RoomTypeOption,
} from '@/lib/api-client/provider-rooms';

interface BffErrorBody {
  error?: { code?: string; message?: string };
}

// Same Baku-center default used server-side when a location is created
// (lib/api-client/provider-rooms.ts's DEFAULT_LOCATION_LAT/LNG) — kept
// as a plain literal here rather than imported, since that module is
// `server-only` and can't be imported into a Client Component. There's
// no geocoding tool in this codebase to turn an address into real
// coordinates; admin can correct a location's exact point later.
const DEFAULT_LAT = 40.3777;
const DEFAULT_LNG = 49.892;

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
  mediaCapabilities,
}: {
  initialLocations: MyLocation[];
  initialRooms: MyRoom[];
  roomTypes: RoomTypeOption[];
  mediaCapabilities: MediaCapabilities;
}) {
  const [locations, setLocations] = useState(initialLocations);
  const [rooms, setRooms] = useState(initialRooms);

  if (locations.length === 0) {
    return <LocationSetupCard onCreated={(location) => setLocations([location])} />;
  }

  return (
    <RoomsCard
      locationId={locations[0].id}
      rooms={rooms}
      roomTypes={roomTypes}
      mediaCapabilities={mediaCapabilities}
      onCreated={(room) => setRooms((prev) => [room, ...prev])}
      onUpdated={(room) => setRooms((prev) => prev.map((item) => (item.id === room.id ? room : item)))}
    />
  );
}

function LocationSetupCard({ onCreated }: { onCreated: (location: MyLocation) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Bakı');
  const [addressLine, setAddressLine] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const response = await fetch('/api/provider/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim(),
          addressLine: addressLine.trim(),
          lat: DEFAULT_LAT,
          lng: DEFAULT_LNG,
        }),
      });
      if (!response.ok) {
        setError(await readBffError(response, 'Ünvan yadda saxlanmadı. Yenidən cəhd edin.'));
        return;
      }
      onCreated((await response.json()) as MyLocation);
    } catch {
      setError('Ünvan yadda saxlanmadı. Yenidən cəhd edin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h3 className="font-display text-h4 text-text-primary">Biznes ünvanı</h3>
        <p className="mt-1 text-small text-text-secondary">
          Otaq əlavə etməzdən əvvəl məkanınızın ünvanını daxil edin. Dəqiq xəritə koordinatını admin sonra
          dəqiqləşdirə bilər.
        </p>
      </div>
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
        <Button type="submit" isLoading={saving} className="self-start">
          {saving ? 'Saxlanılır…' : 'Davam et'}
        </Button>
      </form>
    </Card>
  );
}

function RoomsCard({
  locationId,
  rooms,
  roomTypes,
  mediaCapabilities,
  onCreated,
  onUpdated,
}: {
  locationId: string;
  rooms: MyRoom[];
  roomTypes: RoomTypeOption[];
  mediaCapabilities: MediaCapabilities;
  onCreated: (room: MyRoom) => void;
  onUpdated: (room: MyRoom) => void;
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
            <RoomRow key={room.id} room={room} roomTypes={roomTypes} mediaCapabilities={mediaCapabilities} onUpdated={onUpdated} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AddRoomForm({
  locationId,
  roomTypes,
  onCreated,
  onCancel,
}: {
  locationId: string;
  roomTypes: RoomTypeOption[];
  onCreated: (room: MyRoom) => void;
  onCancel?: () => void;
}) {
  const [roomTypeId, setRoomTypeId] = useState(roomTypes[0]?.id ?? '');
  const [name, setName] = useState('');
  const [capacityMax, setCapacityMax] = useState('4');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomTypeId) {
      setError('Otaq növünü seçin.');
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
          capacityMax: Number(capacityMax),
          basePriceAmount: Math.round(Number(price) * 100),
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
      <FormField id="room-type" label="Otaq növü">
        <Select id="room-type" value={roomTypeId} disabled={saving} onChange={(event) => setRoomTypeId(event.target.value)}>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {ROOM_TYPE_LABEL_AZ[rt.translationKey] ?? rt.translationKey}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id="room-name" label="Otağın adı">
        <Input id="room-name" required value={name} disabled={saving} onChange={(event) => setName(event.target.value)} placeholder="Məs. Podkast Studiyası A" />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="room-capacity" label="Maks. tutum (nəfər)">
          <Input id="room-capacity" type="number" min="1" required value={capacityMax} disabled={saving} onChange={(event) => setCapacityMax(event.target.value)} />
        </FormField>
        <FormField id="room-price" label="Saatlıq qiymət (AZN)">
          <Input id="room-price" type="number" min="0.01" step="0.01" required value={price} disabled={saving} onChange={(event) => setPrice(event.target.value)} />
        </FormField>
      </div>
      <FormField id="room-description" label="Təsvir (könüllü)">
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

function RoomRow({
  room,
  roomTypes,
  mediaCapabilities,
  onUpdated,
}: {
  room: MyRoom;
  roomTypes: RoomTypeOption[];
  mediaCapabilities: MediaCapabilities;
  onUpdated: (room: MyRoom) => void;
}) {
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>();

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

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-body font-semibold text-text-primary">{room.name}</p>
          <p className="text-small text-text-secondary">
            {roomTypeLabel} · {room.capacityMin}–{room.capacityMax} nəfər
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-caption ${STATUS_TONE[room.status]}`}>{STATUS_LABEL[room.status]}</span>
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
        <RoomMediaManager roomId={room.id} capabilities={mediaCapabilities} />
      </div>
    </li>
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
      const presignRes = await fetch(`/api/provider/rooms/${roomId}/media/photos/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFilename: file.name, mimeType: file.type }),
      });
      if (!presignRes.ok) throw new Error(await readBffError(presignRes, 'Şəkil yüklənmədi.'));
      const { uploadUrl, storageKey } = (await presignRes.json()) as { uploadUrl: string; storageKey: string };

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
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
      if (!file.type.startsWith('image/')) {
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
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
