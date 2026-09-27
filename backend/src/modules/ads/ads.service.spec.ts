import { AdsService, isCampaignLive } from './ads.service';
import { HOMEPAGE_SIDEBAR_PLACEMENT } from '../../common/constants/ads.enum';

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
      { recordChange: jest.fn() } as never,
    );
    const rows = await service.analytics();
    expect(rows[0].impressions).toBe(10);
    expect(rows[0].clicks).toBe(2);
    expect(rows[0].ctr).toBe(20);
  });
});
