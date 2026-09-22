'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { MyLocation, MyRoom, MyRoomStatus, RoomTypeOption } from '@/lib/api-client/provider-rooms';

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

/**
 * Sprint 5 — provider self-service room creation. There was previously
 * NO way for a provider to list a room at all from the frontend (only
 * the backend API existed) — this closes that gap: create a business
 * address on first use (a room needs a `locationId`, and registering as
 * a provider doesn't create one), then add rooms with photos, then
 * activate them once the provider account is verified.
 */
export function ProviderRoomsPanel({
  initialLocations,
  initialRooms,
  roomTypes,
}: {
  initialLocations: MyLocation[];
  initialRooms: MyRoom[];
  roomTypes: RoomTypeOption[];
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
  onCreated,
  onUpdated,
}: {
  locationId: string;
  rooms: MyRoom[];
  roomTypes: RoomTypeOption[];
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
            <RoomRow key={room.id} room={room} roomTypes={roomTypes} onUpdated={onUpdated} />
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
        setError(await readBffError(response, 'Otaq yaradılmadı. Yenidən cəhd edin.'));
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
  onUpdated,
}: {
  room: MyRoom;
  roomTypes: RoomTypeOption[];
  onUpdated: (room: MyRoom) => void;
}) {
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | undefined>();

  const roomType = roomTypes.find((rt) => rt.id === room.roomTypeId);
  const roomTypeLabel = roomType ? ROOM_TYPE_LABEL_AZ[roomType.translationKey] ?? roomType.translationKey : '—';

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Yalnız şəkil faylı yükləyin (JPG və ya PNG).');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setUploadError('Şəkil 8MB-dan kiçik olmalıdır.');
      return;
    }
    setUploading(true);
    setUploadError(undefined);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch(`/api/provider/rooms/${room.id}/photos`, { method: 'POST', body: formData });
      if (!response.ok) {
        setUploadError(await readBffError(response, 'Şəkil yüklənmədi. Yenidən cəhd edin.'));
        return;
      }
      setPhotoCount((count) => count + 1);
    } catch {
      setUploadError('Şəkil yüklənmədi. Yenidən cəhd edin.');
    } finally {
      setUploading(false);
    }
  }

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
              ? 'Otağı aktivləşdirmək üçün əvvəlcə ən azı bir şəkil əlavə edin (aşağıdakı "Şəkil əlavə et" sahəsi).'
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
        {uploadError && <Alert variant="error" className="mb-2">{uploadError}</Alert>}
        <label className="flex flex-col gap-1.5 text-label text-text-primary">
          Şəkil əlavə et{photoCount > 0 && <span className="text-caption font-normal text-text-muted"> ({photoCount} yükləndi)</span>}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={handlePhotoChange}
            className="min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-text-primary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-label file:text-accent-on"
          />
        </label>
        <p className="mt-1.5 text-caption text-text-muted">
          Tövsiyə: JPG və ya PNG, ən azı 1200×800px, maksimum 8MB. Aydın, işıqlı və otağın müxtəlif tərəflərini göstərən
          şəkillər daha çox müştəri cəlb edir.
        </p>
      </div>
    </li>
  );
}
