import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';

import { BookingsService } from './bookings.service';
import { BookingEntity } from './entities/booking.entity';
import { BookingItemEntity } from './entities/booking-item.entity';
import { RoomEntity } from '../rooms/entities/room.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { AvailabilityService } from './availability.service';
import { AuthService } from '../auth/auth.service';
import { ReferralTrackingService } from '../partners/referral-tracking.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProvidersService } from '../providers/providers.service';
import { ConfigService } from '@nestjs/config';
import {
  BookingMode,
  BookingStatus,
} from '../../common/constants/booking.enum';
import { InvalidBookingStateTransitionException } from '../../common/exceptions/domain.exception';

/**
 * Covers BookingsService.transition() only — the mode-driven state-machine
 * switch added in T2 ("Phase 1A — Tapşırıq Bölgüsü"). Repositories are
 * in-memory test doubles, deterministic and inspectable, matching this
 * codebase's existing convention (see auth.service.spec.ts). create() and
 * expireStaleHolds() are exercised elsewhere (bookings-concurrency e2e,
 * bookings.controller.spec.ts) and are out of scope here.
 *
 * T4 — transition() now opens its own transaction (`dataSource.transaction`)
 * when called with no external manager, and locks the row via
 * `createQueryBuilder().setLock('pessimistic_write')` rather than a plain
 * `findOne` (a real Postgres requirement — pessimistic_write needs an open
 * transaction — caught by the T4 e2e suite, not this unit suite, since a
 * mocked DataSource can't fail that way). The in-memory repo/DataSource
 * doubles below are extended just enough to satisfy that new call shape;
 * they stay behaviorally identical to the plain findOne/save doubles T2
 * originally wrote.
 */
describe('BookingsService.transition', () => {
  let service: BookingsService;
  let bookings: Partial<BookingEntity>[];
  let bookingItems: Partial<BookingItemEntity>[];
  let idCounter = 0;
  const nextId = () => `booking-${++idCounter}`;

  const makeBookingRepo = () => ({
    create: jest.fn((data: Partial<BookingEntity>) => ({ ...data })),
    save: jest.fn(async (entity: Partial<BookingEntity>) => {
      if (!entity.id) entity.id = nextId();
      const idx = bookings.findIndex((b) => b.id === entity.id);
      if (idx >= 0) bookings[idx] = entity;
      else bookings.push(entity);
      return entity as BookingEntity;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      const found = bookings.find((b) => b.id === where.id);
      return found ?? null;
    }),
    // T4 — transitionWithManager locks via createQueryBuilder(...).setLock(
    // 'pessimistic_write')...getOne() instead of findOne (a real
    // transaction is required for a real pessimistic lock; this in-memory
    // double has no such constraint, so it just mirrors findOne's lookup).
    createQueryBuilder: jest.fn(() => {
      let whereId: string | undefined;
      const builder = {
        setLock: jest.fn(() => builder),
        where: jest.fn((_sql: string, params: { id: string }) => {
          whereId = params.id;
          return builder;
        }),
        getOne: jest.fn(
          async () => bookings.find((b) => b.id === whereId) ?? null,
        ),
      };
      return builder;
    }),
  });

  const makeBookingItemRepo = () => ({
    create: jest.fn((data: Partial<BookingItemEntity>) => ({ ...data })),
    save: jest.fn(async (entity: Partial<BookingItemEntity>) => {
      bookingItems.push(entity);
      return entity as BookingItemEntity;
    }),
    update: jest.fn(
      async (criteria: any, partial: Partial<BookingItemEntity>) => {
        bookingItems
          .filter((i) => i.bookingId === criteria.bookingId)
          .forEach((i) => Object.assign(i, partial));
        return { affected: 1 };
      },
    ),
  });

  /** Seeds a booking row directly into the in-memory store (bypasses create()). */
  const seedBooking = (
    mode: BookingMode,
    status: BookingStatus,
  ): BookingEntity => {
    const booking = {
      id: nextId(),
      customerUserId: 'customer-1',
      status,
      mode,
      currency: 'AZN',
      grossAmount: '10000',
      serviceFeeAmount: '0',
      totalAmount: '10000',
      purpose: null,
      participantsCount: null,
      holdExpiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      confirmedAt: null,
      cancelledAt: null,
      completedAt: null,
      deletedAt: null,
      items: [],
    } as BookingEntity;
    bookings.push(booking);
    bookingItems.push({
      id: `item-${booking.id}`,
      bookingId: booking.id,
      status,
    } as BookingItemEntity);
    return booking;
  };

  beforeEach(async () => {
    bookings = [];
    bookingItems = [];
    idCounter = 0;

    const bookingRepo = makeBookingRepo();
    const bookingItemRepo = makeBookingItemRepo();
    // T4 — transition()'s no-manager path calls
    // `this.dataSource.transaction(cb)`; the fake manager it hands to `cb`
    // only ever needs `getRepository(...)` to return these same in-memory
    // doubles, since transitionWithManager routes every read/write through
    // `manager.getRepository(...)`.
    const fakeManager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === BookingItemEntity ? bookingItemRepo : bookingRepo,
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: jest.fn(async (cb: (m: unknown) => unknown) =>
              cb(fakeManager),
            ),
          },
        },
        { provide: getRepositoryToken(BookingEntity), useValue: bookingRepo },
        {
          provide: getRepositoryToken(BookingItemEntity),
          useValue: bookingItemRepo,
        },
        { provide: getRepositoryToken(RoomEntity), useValue: {} },
        { provide: getRepositoryToken(AppUserEntity), useValue: {} },
        { provide: AvailabilityService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ReferralTrackingService, useValue: {} },
        { provide: NotificationsService, useValue: { send: jest.fn() } },
        { provide: ProvidersService, useValue: {} },
      ],
    }).compile();

    service = module.get(BookingsService);
  });

  // --- PAYMENT_BASED regression: BOOKING_TRANSITIONS must behave exactly
  // as before the mode branch was introduced. ---
  describe('PAYMENT_BASED (existing flow, must not change)', () => {
    it('PENDING -> PAYMENT_PENDING succeeds', async () => {
      const b = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.PENDING);
      const result = await service.transition(
        b.id,
        BookingStatus.PAYMENT_PENDING,
      );
      expect(result.status).toBe(BookingStatus.PAYMENT_PENDING);
    });

    it('PAYMENT_PENDING -> CONFIRMED succeeds and stamps confirmedAt', async () => {
      const b = seedBooking(
        BookingMode.PAYMENT_BASED,
        BookingStatus.PAYMENT_PENDING,
      );
      const result = await service.transition(b.id, BookingStatus.CONFIRMED);
      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(result.confirmedAt).toBeInstanceOf(Date);
    });

    it('CONFIRMED -> CANCELLED succeeds and stamps cancelledAt', async () => {
      const b = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.CONFIRMED);
      const result = await service.transition(b.id, BookingStatus.CANCELLED);
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it('rejects a cross-mode edge: PAYMENT_BASED booking cannot reach REJECTED', async () => {
      const b = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.PENDING);
      await expect(
        service.transition(b.id, BookingStatus.REJECTED),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('rejects a cross-mode edge: PAYMENT_BASED booking cannot reach EXPIRED from CONFIRMED', async () => {
      const b = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.CONFIRMED);
      await expect(
        service.transition(b.id, BookingStatus.EXPIRED),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('CONFIRMED -> NO_SHOW still succeeds for PAYMENT_BASED (sanity check the two tables are not conflated)', async () => {
      const b = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.CONFIRMED);
      const result = await service.transition(b.id, BookingStatus.NO_SHOW);
      expect(result.status).toBe(BookingStatus.NO_SHOW);
    });

    it('rejects CANCELLED_BY_USER / CANCELLED_BY_PROVIDER for a PAYMENT_BASED booking', async () => {
      const a = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.CONFIRMED);
      await expect(
        service.transition(a.id, BookingStatus.CANCELLED_BY_USER),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);

      const b = seedBooking(BookingMode.PAYMENT_BASED, BookingStatus.CONFIRMED);
      await expect(
        service.transition(b.id, BookingStatus.CANCELLED_BY_PROVIDER),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });
  });

  // --- REQUEST_BASED: the new T2 state machine. ---
  describe('REQUEST_BASED (new T2 state machine)', () => {
    it('DRAFT -> PENDING succeeds (schema-completeness edge, not reached by create())', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.DRAFT);
      const result = await service.transition(b.id, BookingStatus.PENDING);
      expect(result.status).toBe(BookingStatus.PENDING);
    });

    it.each([
      BookingStatus.CONFIRMED,
      BookingStatus.REJECTED,
      BookingStatus.EXPIRED,
      BookingStatus.CANCELLED_BY_USER,
    ])('PENDING -> %s succeeds', async (to) => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.PENDING);
      const result = await service.transition(b.id, to);
      expect(result.status).toBe(to);
    });

    it.each([
      BookingStatus.COMPLETED,
      BookingStatus.NO_SHOW,
      BookingStatus.CANCELLED_BY_USER,
      BookingStatus.CANCELLED_BY_PROVIDER,
    ])('CONFIRMED -> %s succeeds', async (to) => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.CONFIRMED);
      const result = await service.transition(b.id, to);
      expect(result.status).toBe(to);
    });

    it('CONFIRMED -> CANCELLED_BY_USER stamps cancelledAt', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.CONFIRMED);
      const result = await service.transition(
        b.id,
        BookingStatus.CANCELLED_BY_USER,
      );
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it('CONFIRMED -> CANCELLED_BY_PROVIDER stamps cancelledAt', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.CONFIRMED);
      const result = await service.transition(
        b.id,
        BookingStatus.CANCELLED_BY_PROVIDER,
      );
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it('rejects PENDING -> COMPLETED', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.PENDING);
      await expect(
        service.transition(b.id, BookingStatus.COMPLETED),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('rejects PENDING -> NO_SHOW', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.PENDING);
      await expect(
        service.transition(b.id, BookingStatus.NO_SHOW),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('rejects CONFIRMED -> REJECTED', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.CONFIRMED);
      await expect(
        service.transition(b.id, BookingStatus.REJECTED),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('rejects CONFIRMED -> EXPIRED', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.CONFIRMED);
      await expect(
        service.transition(b.id, BookingStatus.EXPIRED),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it.each([
      BookingStatus.REJECTED,
      BookingStatus.EXPIRED,
      BookingStatus.CANCELLED_BY_USER,
      BookingStatus.CANCELLED_BY_PROVIDER,
      BookingStatus.COMPLETED,
      BookingStatus.NO_SHOW,
    ])('%s is terminal — any further transition is rejected', async (from) => {
      const b = seedBooking(BookingMode.REQUEST_BASED, from);
      await expect(
        service.transition(b.id, BookingStatus.CONFIRMED),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('rejects a cross-mode edge: REQUEST_BASED booking cannot reach PAYMENT_PENDING', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.PENDING);
      await expect(
        service.transition(b.id, BookingStatus.PAYMENT_PENDING),
      ).rejects.toBeInstanceOf(InvalidBookingStateTransitionException);
    });

    it('keeps booking_item.status in lockstep with the booking', async () => {
      const b = seedBooking(BookingMode.REQUEST_BASED, BookingStatus.PENDING);
      await service.transition(b.id, BookingStatus.CONFIRMED);
      const item = bookingItems.find((i) => i.bookingId === b.id);
      expect(item?.status).toBe(BookingStatus.CONFIRMED);
    });
  });

  // --- Slot-holding regression (ACTIVE_BOOKING_STATUSES semantics must
  // not change: both modes share PENDING/CONFIRMED as the "holds a slot"
  // statuses; only the new terminal statuses are excluded, same as before T2). ---
  it('REQUEST_BASED PENDING and CONFIRMED remain reachable via the same statuses PAYMENT_BASED uses for slot-holding', async () => {
    const pending = seedBooking(
      BookingMode.REQUEST_BASED,
      BookingStatus.PENDING,
    );
    expect(pending.status).toBe(BookingStatus.PENDING);
    const confirmed = await service.transition(
      pending.id,
      BookingStatus.CONFIRMED,
    );
    expect(confirmed.status).toBe(BookingStatus.CONFIRMED);
    // ACTIVE_BOOKING_STATUSES itself (PENDING, PAYMENT_PENDING, CONFIRMED)
    // is untouched by T2 — this test only confirms REQUEST_BASED bookings
    // still pass through those same two statuses on the way to CONFIRMED.
  });
});
