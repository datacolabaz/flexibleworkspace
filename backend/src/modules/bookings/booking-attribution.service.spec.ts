import { Test } from '@nestjs/testing';

import { BookingAttributionService } from './booking-attribution.service';
import { BookingAttributionEntity } from './entities/booking-attribution.entity';
import { AttributionSourceType } from '../../common/constants/attribution.enum';

describe('BookingAttributionService', () => {
  let service: BookingAttributionService;
  const saved: Partial<BookingAttributionEntity>[] = [];

  const manager = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM events')) {
        return [{ id: 'event-1', organizerId: 'org-1' }];
      }
      if (sql.includes('referral_link_click')) return [];
      if (sql.includes('referral_click')) return [];
      return [];
    }),
    create: jest.fn((_e: unknown, data: Partial<BookingAttributionEntity>) => ({
      ...data,
    })),
    save: jest.fn(async (row: BookingAttributionEntity) => {
      saved.push(row);
      return row;
    }),
  };

  beforeEach(async () => {
    saved.length = 0;
    manager.query.mockClear();
    const module = await Test.createTestingModule({
      providers: [BookingAttributionService],
    }).compile();
    service = module.get(BookingAttributionService);
  });

  it('locks attribution and takes organizer_id from the event row, not the client', async () => {
    const row = await service.snapshot(manager as any, {
      bookingId: 'b1',
      locationId: 'loc-1',
      providerId: 'prov-1',
      claimedEventId: 'event-1',
    });
    expect(row?.attributionLockedAt).toBeInstanceOf(Date);
    expect(row?.organizerId).toBe('org-1');
    expect(row?.providerId).toBe('prov-1');
    expect(row?.sourceType).toBe(AttributionSourceType.EVENT_PAGE);
    expect(saved).toHaveLength(1);
  });

  it('treats missing cookies as direct', async () => {
    const row = await service.snapshot(manager as any, {
      bookingId: 'b2',
      locationId: 'loc-1',
      providerId: 'prov-1',
    });
    expect(row?.sourceType).toBe(AttributionSourceType.DIRECT);
  });

  it('swallows unique-violation duplicates', async () => {
    manager.save.mockRejectedValueOnce({ code: '23505' });
    const row = await service.snapshot(manager as any, {
      bookingId: 'b3',
      locationId: 'loc-1',
      providerId: 'prov-1',
    });
    expect(row).toBeNull();
  });
});
