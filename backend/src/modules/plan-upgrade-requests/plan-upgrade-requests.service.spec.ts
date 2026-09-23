import { PlanUpgradeRequestsService } from './plan-upgrade-requests.service';
import { PlanUpgradeRequestStatus } from '../../common/constants/plan-upgrade-request.enum';
import { ProviderPlanTier } from '../../common/constants/provider.enum';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';

/** Deterministic in-memory repository double, same philosophy as rooms.service.spec.ts. */
function makeRequestRepoDouble() {
  const rows: any[] = [];
  let autoId = 0;
  return {
    rows,
    create: (data: any) => ({ ...data }),
    save: jest.fn(async (entity: any) => {
      if (!entity.id) entity.id = `req-${++autoId}`;
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
    findOne: jest.fn(async ({ where, order }: any) => {
      let matches = rows.filter(
        (r) =>
          (where.providerId === undefined ||
            r.providerId === where.providerId) &&
          (where.status === undefined || r.status === where.status) &&
          (where.id === undefined || r.id === where.id),
      );
      if (order?.createdAt === 'DESC') {
        matches = [...matches].sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
      }
      return matches[0] ?? null;
    }),
    find: jest.fn(async ({ where }: any = {}) =>
      rows.filter((r) => !where?.status || r.status === where.status),
    ),
  };
}

describe('PlanUpgradeRequestsService', () => {
  const providerId = 'provider-1';
  const adminUserId = 'admin-1';

  let requestRepo: ReturnType<typeof makeRequestRepoDouble>;
  let providersService: any;
  let service: PlanUpgradeRequestsService;

  beforeEach(() => {
    requestRepo = makeRequestRepoDouble();
    providersService = {
      setPlanTier: jest.fn(async () => ({
        id: providerId,
        planTier: ProviderPlanTier.PRO,
      })),
    };
    service = new PlanUpgradeRequestsService(
      requestRepo as any,
      providersService,
    );
  });

  describe('requestUpgrade()', () => {
    it('creates a new PENDING request', async () => {
      const request = await service.requestUpgrade(
        providerId,
        '  Pro-ya keçmək istəyirəm  ',
      );
      expect(request.status).toBe(PlanUpgradeRequestStatus.PENDING);
      expect(request.note).toBe('Pro-ya keçmək istəyirəm');
      expect(request.providerId).toBe(providerId);
    });

    it('is idempotent — returns the existing PENDING request instead of creating a duplicate', async () => {
      const first = await service.requestUpgrade(providerId, 'first note');
      const second = await service.requestUpgrade(providerId, 'second note');
      expect(second.id).toBe(first.id);
      expect(requestRepo.rows).toHaveLength(1);
    });

    it('stores no note when omitted or blank', async () => {
      const request = await service.requestUpgrade(providerId, '   ');
      expect(request.note).toBeNull();
    });
  });

  describe('myLatestPending()', () => {
    it('returns null when the provider has no open request', async () => {
      expect(await service.myLatestPending(providerId)).toBeNull();
    });

    it("returns another provider's pending request only for that provider", async () => {
      await service.requestUpgrade(providerId, 'mine');
      expect(await service.myLatestPending('other-provider')).toBeNull();
    });
  });

  describe('resolve()', () => {
    it('marks the request resolved without changing the plan when grantPlanTier is omitted', async () => {
      const created = await service.requestUpgrade(providerId);
      const resolved = await service.resolve(created.id, adminUserId);
      expect(resolved.status).toBe(PlanUpgradeRequestStatus.RESOLVED);
      expect(resolved.resolvedByUserId).toBe(adminUserId);
      expect(providersService.setPlanTier).not.toHaveBeenCalled();
    });

    it('grants the plan tier and resolves the request in one call when grantPlanTier is given', async () => {
      const created = await service.requestUpgrade(providerId);
      await service.resolve(created.id, adminUserId, ProviderPlanTier.PRO);
      expect(providersService.setPlanTier).toHaveBeenCalledWith(
        providerId,
        adminUserId,
        ProviderPlanTier.PRO,
      );
    });

    it('404s for an unknown request id', async () => {
      await expect(
        service.resolve('missing', adminUserId),
      ).rejects.toBeInstanceOf(ResourceNotFoundException);
    });
  });

  describe('listForAdmin()', () => {
    it('filters by status when given', async () => {
      const a = await service.requestUpgrade('provider-a');
      await service.resolve(a.id, adminUserId);
      await service.requestUpgrade('provider-b');

      const pending = await service.listForAdmin(
        PlanUpgradeRequestStatus.PENDING,
      );
      expect(pending).toHaveLength(1);
      expect(pending[0].providerId).toBe('provider-b');
    });
  });
});
