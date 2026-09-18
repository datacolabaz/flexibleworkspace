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

describe('RoomsService', () => {
  const providerId = 'provider-1';
  const otherProviderId = 'provider-2';
  const locationId = 'location-1';
  const roomTypeId = 'room-type-1';

  let roomRepo: ReturnType<typeof makeRoomRepoDouble>;
  let amenityRepo: any;
  let roomTypeRepo: any;
  let locationsService: any;
  let providersService: any;
  let storageProvider: any;
  let service: RoomsService;

  beforeEach(() => {
    roomRepo = makeRoomRepoDouble();
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
    storageProvider = { put: jest.fn() };

    service = new RoomsService(
      roomRepo as any,
      amenityRepo,
      roomTypeRepo,
      {} as any, // availabilityRepo — unused by the methods under test
      {} as any, // blockedPeriodRepo
      {} as any, // photoRepo
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

    it('throws PlanLimitReachedException once the FREE tier room limit (3) is reached', async () => {
      // Pre-seed 3 existing rooms for this provider — the FREE limit.
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

    it('activates a room once the owning provider is VERIFIED', async () => {
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

      const updated = await service.setStatus(
        'room-y',
        providerId,
        RoomStatus.ACTIVE,
      );
      expect(updated.status).toBe(RoomStatus.ACTIVE);
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
});
