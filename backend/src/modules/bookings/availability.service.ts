import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';

import { RoomEntity } from '../rooms/entities/room.entity';
import {
  AvailabilityRuleEntity,
  RecurrenceType,
} from '../rooms/entities/availability-rule.entity';
import { BlockedPeriodEntity } from '../rooms/entities/blocked-period.entity';
import { HolidayEntity } from '../rooms/entities/holiday.entity';
import { LocationEntity } from '../../modules/locations/entities/location.entity';
import { BookingItemEntity } from './entities/booking-item.entity';
import { ACTIVE_BOOKING_STATUSES } from '../../common/constants/booking.enum';
import { RoomStatus } from '../../common/constants/provider.enum';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

export interface OpenWindow {
  startAt: Date;
  endAt: Date;
}

/**
 * A fixed floor added on top of `Room.advanceBookingMinHours` (which may
 * legitimately be 0) when computing the earliest bookable instant —
 * without it, `getOpenWindows`'s "earliest = now" edge, recomputed fresh
 * on every call (§12.1's "never cached" rule), makes the *literal first
 * instant* of any window a moving target: a customer who fetches
 * availability, sees a window starting "now", and takes even a few
 * seconds to pick that exact start time and submit has that same instant
 * re-validated against a *later* "now" by `isRangeAvailable` (which reuses
 * this same method) — clamping the window's start further forward and
 * failing the request with a spurious `SLOT_UNAVAILABLE`, even though
 * nothing else was ever booked. Found live: the booking flow's own
 * `BookingWidget` naturally offers this earliest instant as the very
 * first, most obvious start-time option (PHASE4_REPORT.md's booking-flow
 * section). This grace absorbs realistic fetch-to-submit latency for
 * every room, including one with a genuine 0-hour minimum-notice policy,
 * without weakening what `advanceBookingMinHours` means for a room that
 * sets it above zero.
 */
const BOOKING_REQUEST_GRACE_MS = 5 * 60_000;

/**
 * 12_RESERVATION_ENGINE.md §12.1 — composes, in order: Location.opening_hours,
 * Room.AvailabilityRule, Room.BlockedPeriod, existing active BookingItems,
 * Room.buffer_minutes, min/max booking duration, and the advance-booking
 * window. Computed LIVE from source tables on every call — never cached
 * as a separately-maintained availability table (§12.1's explicit rule).
 *
 * This is the fast, good-UX check. The actual, only-trusted guarantee
 * against double-booking is the `no_overlapping_bookings` DB exclusion
 * constraint, enforced independently in BookingsService (§12.2).
 */
@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
    @InjectRepository(AvailabilityRuleEntity)
    private readonly ruleRepo: Repository<AvailabilityRuleEntity>,
    @InjectRepository(BlockedPeriodEntity)
    private readonly blockedRepo: Repository<BlockedPeriodEntity>,
    @InjectRepository(HolidayEntity)
    private readonly holidayRepo: Repository<HolidayEntity>,
    @InjectRepository(BookingItemEntity)
    private readonly bookingItemRepo: Repository<BookingItemEntity>,
  ) {}

  private async loadRoomWithLocation(
    roomId: string,
  ): Promise<{ room: RoomEntity; location: LocationEntity }> {
    const room = await this.roomRepo.findOne({
      where: { id: roomId },
      relations: ['location'],
    });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');
    return { room, location: room.location };
  }

  /** Weekly-schedule windows intersected with any DATE_SPECIFIC override for that date, for one calendar day in the location's timezone. */
  private async dayBaseWindows(
    roomId: string,
    localDate: DateTime,
  ): Promise<{ start: string; end: string }[]> {
    const dayOfWeek = localDate.weekday % 7; // luxon: 1=Mon..7=Sun -> DB: 0=Sun..6=Sat
    const isoDate = localDate.toISODate();

    const rules = await this.ruleRepo.find({ where: { roomId } });
    const dateSpecific = rules.filter(
      (r) =>
        r.recurrenceType === RecurrenceType.DATE_SPECIFIC &&
        r.specificDate === isoDate,
    );
    if (dateSpecific.length > 0) {
      return dateSpecific
        .filter((r) => r.isOpen)
        .map((r) => ({ start: r.startTime, end: r.endTime }));
    }

    const weekly = rules.filter(
      (r) =>
        r.recurrenceType === RecurrenceType.WEEKLY &&
        r.dayOfWeek === dayOfWeek &&
        r.isOpen,
    );
    return weekly.map((r) => ({ start: r.startTime, end: r.endTime }));
  }

  private async isHoliday(
    countryCode: string,
    isoDate: string,
  ): Promise<boolean> {
    const holiday = await this.holidayRepo.findOne({
      where: { countryCode, observedDate: isoDate },
    });
    return !!holiday;
  }

  /**
   * Returns open sub-windows (UTC Date pairs) for one local calendar date,
   * after subtracting blocked periods, existing active bookings (padded by
   * buffer_minutes), and filtering to windows that can fit at least
   * min_booking_minutes.
   */
  async getOpenWindows(
    roomId: string,
    localDateISO: string,
  ): Promise<OpenWindow[]> {
    const { room, location } = await this.loadRoomWithLocation(roomId);
    const zone = location.timezone || 'Asia/Baku';
    const localDate = DateTime.fromISO(localDateISO, { zone });
    if (!localDate.isValid) {
      throw new DomainException(
        'INVALID_DATE',
        'date must be a valid ISO date (YYYY-MM-DD).',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Holiday closes the whole day unless a DATE_SPECIFIC override says otherwise.
    const isoDate = localDate.toISODate()!;
    const rules = await this.ruleRepo.find({ where: { roomId } });
    const hasDateOverride = rules.some(
      (r) =>
        r.recurrenceType === RecurrenceType.DATE_SPECIFIC &&
        r.specificDate === isoDate,
    );
    if (
      !hasDateOverride &&
      (await this.isHoliday(location.countryCode, isoDate))
    ) {
      return [];
    }

    const baseWindows = await this.dayBaseWindows(roomId, localDate);
    if (baseWindows.length === 0) return [];

    // Convert local HH:mm windows to absolute UTC Date ranges for this date.
    let windows: OpenWindow[] = baseWindows.map((w) => {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      const start = localDate.set({
        hour: sh,
        minute: sm,
        second: 0,
        millisecond: 0,
      });
      const end = localDate.set({
        hour: eh,
        minute: em,
        second: 0,
        millisecond: 0,
      });
      return {
        startAt: start.toUTC().toJSDate(),
        endAt: end.toUTC().toJSDate(),
      };
    });

    // Intersect with Location.opening_hours, if configured (JSON: {mon:[["09:00","21:00"]],...}).
    if (location.openingHours) {
      const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      const key = dayKeys[localDate.weekday % 7];
      const locationRanges = (
        location.openingHours as Record<string, [string, string][]>
      )[key];
      if (locationRanges && locationRanges.length > 0) {
        const locWindows: OpenWindow[] = locationRanges.map(([s, e]) => {
          const [sh, sm] = s.split(':').map(Number);
          const [eh, em] = e.split(':').map(Number);
          return {
            startAt: localDate
              .set({ hour: sh, minute: sm, second: 0, millisecond: 0 })
              .toUTC()
              .toJSDate(),
            endAt: localDate
              .set({ hour: eh, minute: em, second: 0, millisecond: 0 })
              .toUTC()
              .toJSDate(),
          };
        });
        windows = this.intersectAll(windows, locWindows);
      } else if (locationRanges !== undefined) {
        return []; // explicit empty array = location closed that day
      }
    }

    // Subtract blocked periods.
    const dayStartUtc = localDate.startOf('day').toUTC().toJSDate();
    const dayEndUtc = localDate.endOf('day').toUTC().toJSDate();
    const blocked = await this.blockedRepo
      .createQueryBuilder('bp')
      .where('bp.room_id = :roomId', { roomId })
      .andWhere('bp.start_at < :dayEnd AND bp.end_at > :dayStart', {
        dayEnd: dayEndUtc,
        dayStart: dayStartUtc,
      })
      .getMany();
    for (const b of blocked) {
      windows = this.subtractRange(windows, {
        startAt: b.startAt,
        endAt: b.endAt,
      });
    }

    // Subtract existing active bookings, padded by buffer_minutes on both sides.
    const bufferMs = room.bufferMinutes * 60_000;
    const activeItems = await this.bookingItemRepo
      .createQueryBuilder('bi')
      .where('bi.room_id = :roomId', { roomId })
      .andWhere('bi.status IN (:...statuses)', {
        statuses: ACTIVE_BOOKING_STATUSES,
      })
      .andWhere('bi.start_at < :dayEnd AND bi.end_at > :dayStart', {
        dayEnd: dayEndUtc,
        dayStart: dayStartUtc,
      })
      .getMany();
    for (const item of activeItems) {
      windows = this.subtractRange(windows, {
        startAt: new Date(item.startAt.getTime() - bufferMs),
        endAt: new Date(item.endAt.getTime() + bufferMs),
      });
    }

    // Advance-booking window: earliest bookable moment and latest bookable date.
    // Clamping a window's start forward to `earliest` can only ever shrink
    // it, so the minimum-duration filter below MUST run after this clamp,
    // not before — filtering first (a prior version of this method did)
    // lets a window that's comfortably long pre-clamp (e.g. spanning from
    // midnight up to an existing booking) survive that check, then get
    // shrunk by the clamp to a sliver narrower than `minBookingMinutes`,
    // which the frontend would still render as a clickable option with no
    // actual valid start time inside it. Found live alongside the
    // BOOKING_REQUEST_GRACE_MS fix above, smoke-testing the booking flow
    // with a room that already had one active booking (PHASE4_REPORT.md).
    const now = new Date();
    const earliest = new Date(
      now.getTime() +
        room.advanceBookingMinHours * 3_600_000 +
        BOOKING_REQUEST_GRACE_MS,
    );
    const latest = new Date(
      now.getTime() + room.advanceBookingMaxDays * 86_400_000,
    );
    windows = windows
      .map((w) => ({
        startAt: w.startAt < earliest ? earliest : w.startAt,
        endAt: w.endAt,
      }))
      .filter((w) => w.startAt < w.endAt && w.startAt <= latest);

    // Drop windows too short to fit the minimum booking duration — checked
    // last, against the post-clamp window bounds actually returned below.
    const minMs = room.minBookingMinutes * 60_000;
    windows = windows.filter(
      (w) => w.endAt.getTime() - w.startAt.getTime() >= minMs,
    );

    return windows;
  }

  /** Checks a specific requested range (used at booking-creation time as the pre-check ahead of the DB constraint). */
  async isRangeAvailable(
    roomId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { room } = await this.loadRoomWithLocation(roomId);
    if (room.status !== RoomStatus.ACTIVE)
      return { ok: false, reason: 'ROOM_NOT_ACTIVE' };

    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60_000;
    if (durationMinutes <= 0) return { ok: false, reason: 'INVALID_RANGE' };
    if (
      durationMinutes < room.minBookingMinutes ||
      durationMinutes > room.maxBookingMinutes
    ) {
      return { ok: false, reason: 'DURATION_OUT_OF_RANGE' };
    }

    // Requested range may span at most the local calendar date it starts in (V1 simplification — 12_RESERVATION_ENGINE.md doesn't require overnight multi-day bookings).
    const location = (await this.loadRoomWithLocation(roomId)).location;
    const zone = location.timezone || 'Asia/Baku';
    const localDateISO = DateTime.fromJSDate(startAt, { zone }).toISODate()!;
    const windows = await this.getOpenWindows(roomId, localDateISO);

    const fits = windows.some((w) => startAt >= w.startAt && endAt <= w.endAt);
    return fits ? { ok: true } : { ok: false, reason: 'SLOT_UNAVAILABLE' };
  }

  private intersectAll(a: OpenWindow[], b: OpenWindow[]): OpenWindow[] {
    const result: OpenWindow[] = [];
    for (const wa of a) {
      for (const wb of b) {
        const start = wa.startAt > wb.startAt ? wa.startAt : wb.startAt;
        const end = wa.endAt < wb.endAt ? wa.endAt : wb.endAt;
        if (start < end) result.push({ startAt: start, endAt: end });
      }
    }
    return result;
  }

  private subtractRange(
    windows: OpenWindow[],
    remove: OpenWindow,
  ): OpenWindow[] {
    const result: OpenWindow[] = [];
    for (const w of windows) {
      if (remove.endAt <= w.startAt || remove.startAt >= w.endAt) {
        result.push(w); // no overlap
        continue;
      }
      if (remove.startAt > w.startAt)
        result.push({ startAt: w.startAt, endAt: remove.startAt });
      if (remove.endAt < w.endAt)
        result.push({ startAt: remove.endAt, endAt: w.endAt });
    }
    return result;
  }
}
