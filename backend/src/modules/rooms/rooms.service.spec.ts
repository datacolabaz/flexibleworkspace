import { RoomsService } from './rooms.service';
import {
  RoomStatus,
  ProviderPlanTier,
  PLAN_ROOM_LIMITS,
} from '../../common/constants/provider.enum';
import { ProviderVerificationStatus } from '../../common/constants/provider.enum';
import {
  DomainException,
  PlanLimitReachedException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

/**
 * Deterministic in-memory repository doubles (not framework auto-mocks),
 * matching the project's established testing philosophy (see
 * auth.service.spec.ts). Only the Repository methods RoomsService actually
 * calls are implemented.
 */
function makeRoomRepoDouble() {
  const rows: any[] = [];
  return {
    rows,
    create: (data: any) => ({ ...data }),
    save: jest.fn(async (entity: any) => {
      if (!entity.id) entity.id = `room-${rows.length + 1}`;
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
    count: jest.fn(async ({ where }: any) => {
      const providerId = where?.location?.providerId;
      return rows.filter((r) => r.__providerId === providerId).length;
    }),
    findOne: jest.fn(
      async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
    ),
    find: jest.fn(async () => rows),
  };
}

/**
 * In-memory photo repo double — implements every Repository method the
 * media-management methods below actually call (count/find/findOne/
 * create/save/update/delete), same in-memory-array philosophy as
 * `makeRoomRepoDouble()`.
 */
function makePhotoRepoDouble() {
  const rows: any[] = [];
  let autoId = 0;
  return {
    rows,
    count: jest.fn(async ({ where }: any) => {
      const roomId = where?.roomId;
      return rows.filter((p) => p.roomId === roomId).length;
    }),
    find: jest.fn(async (opts: any = {}) => {
      const roomId = opts?.where?.roomId;
      let result = roomId ? rows.filter((p) => p.roomId === roomId) : [...rows];
      if (opts?.order?.displayOrder) {
        result = [...result].sort((a, b) => a.displayOrder - b.displayOrder);
      }
      return result;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      return (
        rows.find(
          (p) =>
            (where.id === undefined || p.id === where.id) &&
            (where.roomId === undefined || p.roomId === where.roomId),
        ) ?? null
      );
    }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (entityOrEntities: any) => {
      const entities = Array.isArray(entityOrEntities)
        ? entityOrEntities
        : [entityOrEntities];
      for (const entity of entities) {
        if (!entity.id) entity.id = `photo-${++autoId}`;
        const idx = rows.findIndex((r) => r.id === entity.id);
        if (idx >= 0) rows[idx] = entity;
        else rows.push(entity);
      }
      return entityOrEntities;
    }),
    update: jest.fn(async (where: any, partial: any) => {
      for (const row of rows) {
        const matches =
          (where.roomId === undefined || row.roomId === where.roomId) &&
          (where.id === undefined || row.id === where.id);
        if (matches) Object.assign(row, partial);
      }
    }),
    delete: jest.fn(async (where: any) => {
      const idx = rows.findIndex((r) => r.id === where.id);
      if (idx >= 0) rows.splice(idx, 1);
    }),
  };
}

describe('RoomsService', () => {
  const providerId = 'provider-1';
  const otherProviderId = 'provider-2';
  const locationId = 'location-1';
  const roomTypeId = 'room-type-1';

  let roomRepo: ReturnType<typeof makeRoomRepoDouble>;
  let photoRepo: ReturnType<typeof makePhotoRepoDouble>;
  let amenityRepo: any;
  let roomTypeRepo: any;
  let locationsService: any;
  let providersService: any;
  let storageProvider: any;
  let service: RoomsService;

  beforeEach(() => {
    roomRepo = makeRoomRepoDouble();
    photoRepo = makePhotoRepoDouble();
    amenityRepo = { find: jest.fn(async () => []) };
    roomTypeRepo = {
      findOne: jest.fn(async ({ where }: any) =>
        where.id === roomTypeId ? { id: roomTypeId } : null,
      ),
    };
    locationsService = {
      findById: jest.fn(async (id: string) => {
        if (id !== locationId) throw new ResourceNotFoundException('Location');
        return { id: locationId, providerId };
      }),
    };
    providersService = {
      findById: jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.FREE,
        verificationStatus: ProviderVerificationStatus.PENDING,
      })),
    };
    storageProvider = {
      put: jest.fn(async () => ({
        storageKey: 'stored-key',
        publicUrl: 'https://cdn.example/stored-key',
      })),
      publicUrlFor: jest.fn((key: string) => `https://cdn.example/${key}`),
      getBuffer: jest.fn(),
      createPresignedUpload: jest.fn(async (originalFilename: string) => ({
        storageKey: `presigned-${originalFilename}`,
        uploadUrl: 'https://r2.example/upload-url',
        publicUrl: 'https://cdn.example/presigned',
      })),
      headSize: jest.fn(async () => 1024),
      delete: jest.fn(async () => undefined),
    };

    service = new RoomsService(
      roomRepo as any,
      amenityRepo,
      roomTypeRepo,
      {} as any, // availabilityRepo — unused by the methods under test
      {} as any, // blockedPeriodRepo
      photoRepo as any,
      locationsService,
      providersService,
      storageProvider,
    );
  });

  describe('create() — plan-tier limits (25_PROVIDER_ARCHITECTURE.md §25.2)', () => {
    it('allows room creation under the FREE tier limit', async () => {
      const room = await service.create(providerId, {
        locationId,
        roomTypeId,
        name: 'Test Room',
        capacityMax: 4,
        basePriceAmount: 5000,
      } as any);
      expect(room.status).toBe(RoomStatus.DRAFT);
      expect(room.name).toBe('Test Room');
    });

    it('throws PlanLimitReachedException once the FREE tier room limit is reached', async () => {
      // Pre-seed rooms up to the FREE limit (currently 1) for this provider.
      for (let i = 0; i < PLAN_ROOM_LIMITS[ProviderPlanTier.FREE]; i++) {
        roomRepo.rows.push({ id: `existing-${i}`, __providerId: providerId });
      }

      await expect(
        service.create(providerId, {
          locationId,
          roomTypeId,
          name: 'One Too Many',
          capacityMax: 4,
          basePriceAmount: 5000,
        } as any),
      ).rejects.toBeInstanceOf(PlanLimitReachedException);
    });
  });

  describe('create() — location ownership', () => {
    it('rejects creating a room under a location owned by a different provider', async () => {
      await expect(
        service.create(otherProviderId, {
          locationId, // owned by `providerId`, not `otherProviderId`
          roomTypeId,
          name: 'Cross-Tenant Room',
          capacityMax: 4,
          basePriceAmount: 5000,
        } as any),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('setStatus() — DRAFT -> ACTIVE gating (09_DOMAIN_MODEL.md §9.2)', () => {
    it('refuses to activate a room when the owning provider is not VERIFIED', async () => {
      const room = {
        id: 'room-x',
        status: RoomStatus.DRAFT,
        location: { providerId },
      };
      roomRepo.rows.push(room);

      await expect(
        service.setStatus('room-x', providerId, RoomStatus.ACTIVE),
      ).rejects.toBeInstanceOf(DomainException);
      await expect(
        service.setStatus('room-x', providerId, RoomStatus.ACTIVE),
      ).rejects.toMatchObject({
        code: 'PROVIDER_NOT_VERIFIED',
      });
    });

    it('activates a room once the owning provider is VERIFIED and the room has a photo', async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.FREE,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      const room = {
        id: 'room-y',
        status: RoomStatus.DRAFT,
        location: { providerId },
      };
      roomRepo.rows.push(room);
      photoRepo.rows.push({ roomId: 'room-y' });

      const updated = await service.setStatus(
        'room-y',
        providerId,
        RoomStatus.ACTIVE,
      );
      expect(updated.status).toBe(RoomStatus.ACTIVE);
    });

    it("refuses to activate a VERIFIED provider's room that has no photos yet", async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.FREE,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      const room = {
        id: 'room-no-photo',
        status: RoomStatus.DRAFT,
        location: { providerId },
      };
      roomRepo.rows.push(room);
      // No photoRepo.rows entry for this room — zero photos.

      await expect(
        service.setStatus('room-no-photo', providerId, RoomStatus.ACTIVE),
      ).rejects.toMatchObject({
        code: 'ROOM_NO_PHOTOS',
      });
    });

    it('does not gate a transition to INACTIVE on verification status', async () => {
      const room = {
        id: 'room-z',
        status: RoomStatus.ACTIVE,
        location: { providerId },
      };
      roomRepo.rows.push(room);

      const updated = await service.setStatus(
        'room-z',
        providerId,
        RoomStatus.INACTIVE,
      );
      expect(updated.status).toBe(RoomStatus.INACTIVE);
      expect(providersService.findById).not.toHaveBeenCalled();
    });

    it('404s (not 403) when a provider tries to change a room it does not own', async () => {
      const room = {
        id: 'room-w',
        status: RoomStatus.DRAFT,
        location: { providerId },
      };
      roomRepo.rows.push(room);

      await expect(
        service.setStatus('room-w', otherProviderId, RoomStatus.ACTIVE),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('getRoomMedia()', () => {
    it('returns display-ready URLs for photos and video, ordered by displayOrder', async () => {
      roomRepo.rows.push({
        id: 'room-m1',
        location: { providerId },
        videoStorageKey: 'vid-key',
        videoDurationSeconds: 12,
        videoSizeBytes: '999',
        videoMimeType: 'video/mp4',
      });
      photoRepo.rows.push(
        {
          id: 'p2',
          roomId: 'room-m1',
          storageKey: 'k2',
          isCover: false,
          displayOrder: 1,
        },
        {
          id: 'p1',
          roomId: 'room-m1',
          storageKey: 'k1',
          isCover: true,
          displayOrder: 0,
        },
      );

      const media = await service.getRoomMedia('room-m1', providerId);
      expect(media.photos.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(media.photos[0].url).toBe('https://cdn.example/k1');
      expect(media.video?.url).toBe('https://cdn.example/vid-key');
      expect(media.video?.durationSeconds).toBe(12);
    });

    it('returns video: null when the room has no video', async () => {
      roomRepo.rows.push({ id: 'room-m2', location: { providerId } });
      const media = await service.getRoomMedia('room-m2', providerId);
      expect(media.video).toBeNull();
      expect(media.photos).toEqual([]);
    });

    it('404s when the room belongs to a different provider', async () => {
      roomRepo.rows.push({ id: 'room-m3', location: { providerId } });
      await expect(
        service.getRoomMedia('room-m3', otherProviderId),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('getMediaCapabilities()', () => {
    it("reflects the caller's plan tier and whether direct upload is available", async () => {
      const caps = await service.getMediaCapabilities(providerId);
      expect(caps.directUploadSupported).toBe(true);
      expect(caps.maxImageCount).toBe(5); // FREE
      expect(caps.videoAllowed).toBe(false); // FREE has no video
      expect(caps.maxVideoCount).toBe(0);
    });

    it('reports video allowed for a PRO plan', async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.PRO,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      const caps = await service.getMediaCapabilities(providerId);
      expect(caps.maxImageCount).toBe(10); // PRO
      expect(caps.videoAllowed).toBe(true);
      expect(caps.maxVideoDurationSeconds).toBe(30);
      expect(caps.maxVideoSizeBytes).toBe(20 * 1024 * 1024);
    });
  });

  describe('presignPhotoUpload() — plan photo-count entitlement', () => {
    it('returns a presigned upload when under the plan limit', async () => {
      roomRepo.rows.push({ id: 'room-p1', location: { providerId } });
      const result = await service.presignPhotoUpload(
        'room-p1',
        providerId,
        'photo.jpg',
        'image/jpeg',
      );
      expect(result.uploadUrl).toBe('https://r2.example/upload-url');
      expect(storageProvider.createPresignedUpload).toHaveBeenCalledWith(
        'photo.jpg',
        'image/jpeg',
      );
    });

    it('rejects once the FREE plan photo limit (5) is reached', async () => {
      roomRepo.rows.push({ id: 'room-p2', location: { providerId } });
      for (let i = 0; i < 5; i++) {
        photoRepo.rows.push({ id: `existing-photo-${i}`, roomId: 'room-p2' });
      }
      await expect(
        service.presignPhotoUpload(
          'room-p2',
          providerId,
          'photo.jpg',
          'image/jpeg',
        ),
      ).rejects.toBeInstanceOf(PlanLimitReachedException);
    });

    it('404s when the room belongs to a different provider', async () => {
      roomRepo.rows.push({ id: 'room-p3', location: { providerId } });
      await expect(
        service.presignPhotoUpload(
          'room-p3',
          otherProviderId,
          'photo.jpg',
          'image/jpeg',
        ),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });

    it('refuses when the active storage driver has no presign support (local dev)', async () => {
      storageProvider.createPresignedUpload = undefined;
      roomRepo.rows.push({ id: 'room-p4', location: { providerId } });
      await expect(
        service.presignPhotoUpload(
          'room-p4',
          providerId,
          'photo.jpg',
          'image/jpeg',
        ),
      ).rejects.toMatchObject({ code: 'DIRECT_UPLOAD_UNSUPPORTED' });
    });
  });

  describe('confirmPhoto() — the fixed moderation-status bug', () => {
    it('auto-approves the photo instead of leaving it at the entity default (PENDING)', async () => {
      roomRepo.rows.push({ id: 'room-c1', location: { providerId } });
      const photo = await service.confirmPhoto('room-c1', providerId, {
        storageKey: 'key-1',
      } as any);
      expect(photo.moderationStatus).toBe('APPROVED');
      expect(photo.isCover).toBe(true); // first photo defaults to cover
    });

    it('enforces the plan photo-count limit at confirm time too (not just at presign time)', async () => {
      roomRepo.rows.push({ id: 'room-c2', location: { providerId } });
      for (let i = 0; i < 5; i++) {
        photoRepo.rows.push({ id: `existing-${i}`, roomId: 'room-c2' });
      }
      await expect(
        service.confirmPhoto('room-c2', providerId, {
          storageKey: 'key-x',
        } as any),
      ).rejects.toBeInstanceOf(PlanLimitReachedException);
    });

    it('unsets the previous cover when the new photo is confirmed as cover', async () => {
      roomRepo.rows.push({ id: 'room-c3', location: { providerId } });
      photoRepo.rows.push({
        id: 'old-cover',
        roomId: 'room-c3',
        isCover: true,
      });
      await service.confirmPhoto('room-c3', providerId, {
        storageKey: 'key-2',
        isCover: true,
      } as any);
      const oldCover = photoRepo.rows.find((p: any) => p.id === 'old-cover');
      expect(oldCover.isCover).toBe(false);
    });

    it('rejects when the object never actually landed in storage, instead of creating a broken photo record (verified via headSize, not trusted from the client)', async () => {
      roomRepo.rows.push({ id: 'room-c4', location: { providerId } });
      storageProvider.headSize = jest.fn(async () => {
        throw new Error('NotFound: the object does not exist');
      });
      await expect(
        service.confirmPhoto('room-c4', providerId, {
          storageKey: 'never-uploaded-key',
        } as any),
      ).rejects.toMatchObject({ code: 'PHOTO_UPLOAD_INCOMPLETE' });
      expect(
        photoRepo.rows.find((p: any) => p.storageKey === 'never-uploaded-key'),
      ).toBeUndefined();
    });

    it('skips the storage check when the active driver has no headSize support (local dev)', async () => {
      roomRepo.rows.push({ id: 'room-c5', location: { providerId } });
      storageProvider.headSize = undefined;
      const photo = await service.confirmPhoto('room-c5', providerId, {
        storageKey: 'key-3',
      } as any);
      expect(photo.storageKey).toBe('key-3');
    });
  });

  describe('addPhoto() — legacy multipart fallback', () => {
    it('auto-approves and enforces the plan limit exactly like confirmPhoto()', async () => {
      roomRepo.rows.push({ id: 'room-a1', location: { providerId } });
      const photo = await service.addPhoto(
        'room-a1',
        providerId,
        {
          buffer: Buffer.from('x'),
          originalname: 'a.jpg',
          mimetype: 'image/jpeg',
        },
        false,
      );
      expect(photo.moderationStatus).toBe('APPROVED');
    });

    it('rejects once the plan photo limit is reached', async () => {
      roomRepo.rows.push({ id: 'room-a2', location: { providerId } });
      for (let i = 0; i < 5; i++) {
        photoRepo.rows.push({ id: `existing-${i}`, roomId: 'room-a2' });
      }
      await expect(
        service.addPhoto(
          'room-a2',
          providerId,
          {
            buffer: Buffer.from('x'),
            originalname: 'a.jpg',
            mimetype: 'image/jpeg',
          },
          false,
        ),
      ).rejects.toBeInstanceOf(PlanLimitReachedException);
    });
  });

  describe('removePhoto()', () => {
    it('deletes the storage object and promotes a new cover if the removed photo was the cover', async () => {
      roomRepo.rows.push({ id: 'room-r1', location: { providerId } });
      photoRepo.rows.push(
        {
          id: 'p1',
          roomId: 'room-r1',
          isCover: true,
          displayOrder: 0,
          storageKey: 'k1',
        },
        {
          id: 'p2',
          roomId: 'room-r1',
          isCover: false,
          displayOrder: 1,
          storageKey: 'k2',
        },
      );
      const remaining = await service.removePhoto('room-r1', providerId, 'p1');
      expect(storageProvider.delete).toHaveBeenCalledWith('k1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].isCover).toBe(true);
      expect(remaining[0].displayOrder).toBe(0);
    });

    it('404s for a photo that does not belong to this room', async () => {
      roomRepo.rows.push({ id: 'room-r2', location: { providerId } });
      await expect(
        service.removePhoto('room-r2', providerId, 'missing-photo'),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('reorderPhotos()', () => {
    it('applies the new displayOrder for exactly the photos supplied', async () => {
      roomRepo.rows.push({ id: 'room-o1', location: { providerId } });
      photoRepo.rows.push(
        { id: 'p1', roomId: 'room-o1', displayOrder: 0 },
        { id: 'p2', roomId: 'room-o1', displayOrder: 1 },
      );
      await service.reorderPhotos('room-o1', providerId, {
        photoIds: ['p2', 'p1'],
      });
      expect(photoRepo.rows.find((p: any) => p.id === 'p2').displayOrder).toBe(
        0,
      );
      expect(photoRepo.rows.find((p: any) => p.id === 'p1').displayOrder).toBe(
        1,
      );
    });

    it("rejects a photoIds list that does not match the room's actual photos", async () => {
      roomRepo.rows.push({ id: 'room-o2', location: { providerId } });
      photoRepo.rows.push({ id: 'p1', roomId: 'room-o2', displayOrder: 0 });
      await expect(
        service.reorderPhotos('room-o2', providerId, {
          photoIds: ['p1', 'ghost'],
        }),
      ).rejects.toMatchObject({ code: 'INVALID_PHOTO_SET' });
    });
  });

  describe('setCoverPhoto()', () => {
    it('makes exactly one photo the cover', async () => {
      roomRepo.rows.push({ id: 'room-v1', location: { providerId } });
      photoRepo.rows.push(
        { id: 'p1', roomId: 'room-v1', isCover: true, displayOrder: 0 },
        { id: 'p2', roomId: 'room-v1', isCover: false, displayOrder: 1 },
      );
      const result = await service.setCoverPhoto('room-v1', providerId, 'p2');
      expect(result.find((p: any) => p.id === 'p1').isCover).toBe(false);
      expect(result.find((p: any) => p.id === 'p2').isCover).toBe(true);
    });
  });

  describe('video — PRO-only, duration/size entitlements', () => {
    it('refuses to presign a video upload on the FREE plan', async () => {
      roomRepo.rows.push({ id: 'room-vid1', location: { providerId } });
      await expect(
        service.presignVideoUpload(
          'room-vid1',
          providerId,
          'clip.mp4',
          'video/mp4',
        ),
      ).rejects.toMatchObject({ code: 'PLAN_VIDEO_NOT_ALLOWED' });
    });

    it('confirms a video within limits on the PRO plan', async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.PRO,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      roomRepo.rows.push({ id: 'room-vid2', location: { providerId } });
      storageProvider.headSize = jest.fn(async () => 10 * 1024 * 1024); // 10MB, under the 20MB PRO cap

      const room = await service.confirmVideo('room-vid2', providerId, {
        storageKey: 'video-key',
        durationSeconds: 20,
        mimeType: 'video/mp4',
      });
      expect(room.videoStorageKey).toBe('video-key');
      expect(room.videoDurationSeconds).toBe(20);
    });

    it('rejects a video longer than the plan max and deletes the orphaned upload', async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.PRO,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      roomRepo.rows.push({ id: 'room-vid3', location: { providerId } });

      await expect(
        service.confirmVideo('room-vid3', providerId, {
          storageKey: 'too-long-key',
          durationSeconds: 45,
          mimeType: 'video/mp4',
        }),
      ).rejects.toMatchObject({ code: 'VIDEO_TOO_LONG' });
      expect(storageProvider.delete).toHaveBeenCalledWith('too-long-key');
    });

    it('rejects a video whose actual uploaded size exceeds the plan max (verified via headSize, not trusted from the client)', async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.PRO,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      roomRepo.rows.push({ id: 'room-vid4', location: { providerId } });
      storageProvider.headSize = jest.fn(async () => 25 * 1024 * 1024); // 25MB, over the 20MB PRO cap

      await expect(
        service.confirmVideo('room-vid4', providerId, {
          storageKey: 'too-big-key',
          durationSeconds: 10,
          mimeType: 'video/mp4',
        }),
      ).rejects.toMatchObject({ code: 'VIDEO_TOO_LARGE' });
      expect(storageProvider.delete).toHaveBeenCalledWith('too-big-key');
    });

    it('deletes the previous video from storage when a new one replaces it', async () => {
      providersService.findById = jest.fn(async (id: string) => ({
        id,
        planTier: ProviderPlanTier.PRO,
        verificationStatus: ProviderVerificationStatus.VERIFIED,
      }));
      roomRepo.rows.push({
        id: 'room-vid5',
        location: { providerId },
        videoStorageKey: 'old-video-key',
      });
      storageProvider.headSize = jest.fn(async () => 5 * 1024 * 1024);

      await service.confirmVideo('room-vid5', providerId, {
        storageKey: 'new-video-key',
        durationSeconds: 15,
        mimeType: 'video/mp4',
      });
      expect(storageProvider.delete).toHaveBeenCalledWith('old-video-key');
    });

    it('removeVideo() clears the video fields and deletes the storage object', async () => {
      roomRepo.rows.push({
        id: 'room-vid6',
        location: { providerId },
        videoStorageKey: 'existing-key',
        videoDurationSeconds: 20,
        videoSizeBytes: '123',
        videoMimeType: 'video/mp4',
      });
      const room = await service.removeVideo('room-vid6', providerId);
      expect(storageProvider.delete).toHaveBeenCalledWith('existing-key');
      expect(room.videoStorageKey).toBeNull();
      expect(room.videoDurationSeconds).toBeNull();
    });
  });
});
