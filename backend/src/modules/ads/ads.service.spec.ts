import { AdsService, isCampaignLive } from './ads.service';
import { HOMEPAGE_SIDEBAR_PLACEMENT } from '../../common/constants/ads.enum';
import { AdInquiryStatus } from '../../common/constants/ad-inquiry.enum';

function makeRepoDouble<T extends { id?: string }>(rows: T[]) {
  let autoId = 0;
  return {
    rows,
    create: (data: T) => ({ ...data }),
    save: jest.fn(async (entity: T) => {
      if (!entity.id) (entity as { id: string }).id = `id-${++autoId}`;
      const idx = rows.findIndex((row) => row.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
    find: jest.fn(
      async ({ where }: { where?: Record<string, unknown> } = {}) => {
        if (!where) return [...rows];
        return rows.filter((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        );
      },
    ),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        rows.find((row) =>
          Object.entries(where).every(
            ([key, value]) => (row as Record<string, unknown>)[key] === value,
          ),
        ) ?? null
      );
    }),
    remove: jest.fn(async (entity: T) => {
      const idx = rows.findIndex((row) => row.id === entity.id);
      if (idx >= 0) rows.splice(idx, 1);
      return entity;
    }),
  };
}

describe('AdsService', () => {
  const now = new Date('2026-09-27T12:00:00.000Z');

  it('isCampaignLive requires active flag and date window', () => {
    expect(
      isCampaignLive(
        {
          active: true,
          startsAt: null,
          endsAt: null,
          creativeUrl: 'https://cdn.example/a.jpg',
          clickUrl: 'https://example.com',
        } as never,
        now,
      ),
    ).toBe(true);
    expect(
      isCampaignLive(
        {
          active: false,
          startsAt: null,
          endsAt: null,
          creativeUrl: 'https://cdn.example/a.jpg',
          clickUrl: 'https://example.com',
        } as never,
        now,
      ),
    ).toBe(false);
    expect(
      isCampaignLive(
        {
          active: true,
          startsAt: new Date('2026-10-01T00:00:00.000Z'),
          endsAt: null,
          creativeUrl: 'https://cdn.example/a.jpg',
          clickUrl: 'https://example.com',
        } as never,
        now,
      ),
    ).toBe(false);
    expect(
      isCampaignLive(
        {
          active: true,
          startsAt: null,
          endsAt: new Date('2026-09-01T00:00:00.000Z'),
          creativeUrl: 'https://cdn.example/a.jpg',
          clickUrl: 'https://example.com',
        } as never,
        now,
      ),
    ).toBe(false);
  });

  it('getPublicSlot returns only live campaigns and the placement interval', async () => {
    const placement = {
      id: 'pl-1',
      key: HOMEPAGE_SIDEBAR_PLACEMENT,
      name: 'Homepage sidebar',
      rotationIntervalSeconds: 60,
    };
    const live = {
      id: 'c-live',
      placementId: 'pl-1',
      active: true,
      startsAt: null,
      endsAt: null,
      advertiserName: 'A',
      creativeUrl: 'https://cdn.example/a.jpg',
      clickUrl: 'https://a.example',
      weight: 3,
      creativeSize: '336x280',
    };
    const paused = {
      ...live,
      id: 'c-paused',
      active: false,
      advertiserName: 'B',
    };
    const placementRepo = makeRepoDouble([placement]);
    const campaignRepo = makeRepoDouble([live, paused]);
    const eventRepo = makeRepoDouble([]);
    const service = new AdsService(
      placementRepo as never,
      campaignRepo as never,
      eventRepo as never,
      makeRepoDouble([]) as never,
      { recordChange: jest.fn() } as never,
    );

    const slot = await service.getPublicSlot(HOMEPAGE_SIDEBAR_PLACEMENT);
    expect(slot.rotationIntervalSeconds).toBe(60);
    expect(slot.ads).toHaveLength(1);
    expect(slot.ads[0].id).toBe('c-live');
    expect(slot.ads[0].weight).toBe(3);
  });

  it('recordEvent is idempotent on clientEventId', async () => {
    const campaign = {
      id: 'c-1',
      active: true,
      startsAt: null,
      endsAt: null,
      creativeUrl: 'https://cdn.example/a.jpg',
      clickUrl: 'https://a.example',
    };
    const campaignRepo = makeRepoDouble([campaign]);
    const eventRepo = makeRepoDouble([
      {
        id: 'e-1',
        campaignId: 'c-1',
        eventType: 'impression',
        clientEventId: 'dup',
      },
    ]);
    const service = new AdsService(
      makeRepoDouble([]) as never,
      campaignRepo as never,
      eventRepo as never,
      makeRepoDouble([]) as never,
      { recordChange: jest.fn() } as never,
    );
    const first = await service.recordEvent('c-1', {
      type: 'impression',
      eventId: 'dup',
    });
    expect(first.recorded).toBe(false);
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('rejects rotation intervals outside 30/45/60/90', async () => {
    const placementRepo = makeRepoDouble([
      {
        id: 'pl-1',
        key: HOMEPAGE_SIDEBAR_PLACEMENT,
        rotationIntervalSeconds: 45,
      },
    ]);
    const service = new AdsService(
      placementRepo as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      { recordChange: jest.fn() } as never,
    );
    await expect(
      service.updatePlacement('pl-1', 'admin-1', {
        rotationIntervalSeconds: 12,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_AD_INTERVAL' });
  });

  it('analytics computes CTR from impressions and clicks', async () => {
    const campaignRepo = {
      find: jest.fn(async () => [
        {
          id: 'c-1',
          advertiserName: 'A',
          active: true,
          startsAt: null,
          endsAt: null,
          creativeUrl: 'https://cdn.example/a.jpg',
          clickUrl: 'https://a.example',
          placement: { key: HOMEPAGE_SIDEBAR_PLACEMENT },
        },
      ]),
    };
    const eventRepo = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(async () => [
          { campaignId: 'c-1', impressions: '10', clicks: '2' },
        ]),
      })),
    };
    const service = new AdsService(
      makeRepoDouble([]) as never,
      campaignRepo as never,
      eventRepo as never,
      makeRepoDouble([]) as never,
      { recordChange: jest.fn() } as never,
    );
    const rows = await service.analytics();
    expect(rows[0].impressions).toBe(10);
    expect(rows[0].clicks).toBe(2);
    expect(rows[0].ctr).toBe(20);
  });

  it('createInquiry trims fields, defaults empty optionals to null and status to NEW', async () => {
    const inquiryRepo = makeRepoDouble([]);
    const service = new AdsService(
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      inquiryRepo as never,
      { recordChange: jest.fn() } as never,
    );

    const saved = await service.createInquiry({
      contactName: '  Aysel Məmmədova  ',
      contactPhone: ' +994501234567 ',
      contactEmail: '  ',
      companyName: undefined,
      message: undefined,
    });

    expect(saved.contactName).toBe('Aysel Məmmədova');
    expect(saved.contactPhone).toBe('+994501234567');
    expect(saved.contactEmail).toBeNull();
    expect(saved.companyName).toBeNull();
    expect(saved.message).toBeNull();
    expect(saved.status).toBe(AdInquiryStatus.NEW);
    expect(inquiryRepo.save).toHaveBeenCalledTimes(1);
  });

  it('listInquiries returns newest first', async () => {
    const older = {
      id: 'i-1',
      contactName: 'A',
      contactPhone: '1',
      status: AdInquiryStatus.NEW,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    const newer = {
      id: 'i-2',
      contactName: 'B',
      contactPhone: '2',
      status: AdInquiryStatus.NEW,
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    };
    const inquiryRepo = makeRepoDouble([older, newer]);
    const service = new AdsService(
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      inquiryRepo as never,
      { recordChange: jest.fn() } as never,
    );

    await service.listInquiries();
    expect(inquiryRepo.find).toHaveBeenCalledWith({
      order: { createdAt: 'DESC' },
      take: 200,
    });
  });

  it('updateInquiryStatus stamps contactedAt/contactedBy only on first CONTACTED transition', async () => {
    const inquiry = {
      id: 'i-1',
      contactName: 'Aysel',
      contactPhone: '+994501234567',
      status: AdInquiryStatus.NEW,
      contactedAt: null as Date | null,
      contactedByUserId: null as string | null,
    };
    const inquiryRepo = makeRepoDouble([inquiry]);
    const recordChange = jest.fn();
    const service = new AdsService(
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      inquiryRepo as never,
      { recordChange } as never,
    );

    const saved = await service.updateInquiryStatus('i-1', 'admin-1', {
      status: AdInquiryStatus.CONTACTED,
    });
    expect(saved.status).toBe(AdInquiryStatus.CONTACTED);
    expect(saved.contactedAt).not.toBeNull();
    expect(saved.contactedByUserId).toBe('admin-1');
    expect(recordChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'AdInquiry',
        action: 'ADMIN_AD_INQUIRY_STATUS_UPDATE',
        beforeState: { status: AdInquiryStatus.NEW },
        afterState: { status: AdInquiryStatus.CONTACTED },
      }),
    );

    const firstContactedAt = saved.contactedAt;
    const closed = await service.updateInquiryStatus('i-1', 'admin-2', {
      status: AdInquiryStatus.CLOSED,
    });
    expect(closed.status).toBe(AdInquiryStatus.CLOSED);
    // contactedAt/contactedBy are set once, on the first CONTACTED move —
    // a later status change (here, straight to CLOSED) must not touch them.
    expect(closed.contactedAt).toBe(firstContactedAt);
    expect(closed.contactedByUserId).toBe('admin-1');
  });

  it('updateInquiryStatus throws when the inquiry does not exist', async () => {
    const service = new AdsService(
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      makeRepoDouble([]) as never,
      { recordChange: jest.fn() } as never,
    );

    await expect(
      service.updateInquiryStatus('missing', 'admin-1', {
        status: AdInquiryStatus.CONTACTED,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
