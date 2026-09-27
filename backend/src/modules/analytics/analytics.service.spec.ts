import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { AnalyticsService } from './analytics.service';
import { VisitorEventEntity } from './entities/visitor-event.entity';
import { AnalyticsEventEntity } from './entities/analytics-event.entity';
import { DomainException } from '../../common/exceptions/domain.exception';

describe('AnalyticsService.recordProductEvent', () => {
  let service: AnalyticsService;
  const insert = jest.fn(async () => undefined);

  beforeEach(async () => {
    insert.mockClear();
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(VisitorEventEntity), useValue: {} },
        {
          provide: getRepositoryToken(AnalyticsEventEntity),
          useValue: { insert },
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: jest.fn(async () => [{ providerId: 'p1' }]) },
        },
      ],
    }).compile();
    service = module.get(AnalyticsService);
  });

  it('rejects unknown event names', async () => {
    await expect(
      service.recordProductEvent({ eventName: 'not_a_real_event' }),
    ).rejects.toBeInstanceOf(DomainException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('accepts purpose-search analytics events', async () => {
    await service.recordProductEvent({
      eventName: 'purpose_search_submitted',
      props: {
        activity: 'PODCAST_RECORDING',
        mapped_category: 'PODCAST_STUDIO',
        participants: 10,
        metroStationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      },
    });
    expect(insert).toHaveBeenCalled();
  });

  it('strips PII keys and uses JWT user id', async () => {
    await service.recordProductEvent({
      eventName: 'whatsapp_contact_clicked',
      jwtUserId: 'user-jwt',
      props: { email: 'a@b.c', phone: '+994', location_id: 'not-uuid' },
    });
    expect(insert).toHaveBeenCalled();
    const calls = insert.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const row = calls[0][0];
    expect(row.userId).toBe('user-jwt');
    expect(
      (row.metadata as Record<string, unknown> | undefined)?.email,
    ).toBeUndefined();
    expect(
      (row.metadata as Record<string, unknown> | undefined)?.phone,
    ).toBeUndefined();
  });
});
