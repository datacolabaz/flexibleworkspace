import { ProvidersService } from './providers.service';
import {
  ProviderPlanTier,
  ProviderVerificationStatus,
} from '../../common/constants/provider.enum';

function makeProviderRepoDouble() {
  const rows: any[] = [];
  let autoId = 0;
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id) return rows.find((row) => row.id === where.id) ?? null;
      if (where?.slug)
        return rows.find((row) => row.slug === where.slug) ?? null;
      return null;
    }),
    create: jest.fn((data: any) => ({
      id: `provider-${++autoId}`,
      taxId: null,
      verificationDocuments: [],
      planTier: ProviderPlanTier.FREE,
      bankAccountDetails: null,
      logoStorageKey: null,
      deletedAt: null,
      ...data,
    })),
    save: jest.fn(async (entity: any) => {
      const index = rows.findIndex((row) => row.id === entity.id);
      if (index >= 0) rows[index] = entity;
      else rows.push(entity);
      return entity;
    }),
  };
}

function makeRepositoryDouble() {
  const rows: any[] = [];
  return {
    rows,
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (entity: any) => {
      rows.push(entity);
      return entity;
    }),
  };
}

describe('ProvidersService', () => {
  let providerRepo: ReturnType<typeof makeProviderRepoDouble>;
  let verificationEventRepo: ReturnType<typeof makeRepositoryDouble>;
  let roleRepo: ReturnType<typeof makeRepositoryDouble>;
  let service: ProvidersService;

  beforeEach(() => {
    providerRepo = makeProviderRepoDouble();
    verificationEventRepo = makeRepositoryDouble();
    roleRepo = makeRepositoryDouble();

    service = new ProvidersService(
      providerRepo as any,
      verificationEventRepo as any,
      roleRepo as any,
      {} as any, // auditLogService — unused by the methods under test
      {} as any, // privateStorageProvider — unused by the methods under test
      {} as any, // publicStorageProvider — unused by the methods under test
    );
  });

  describe('create() — document-free onboarding', () => {
    it('creates a VERIFIED provider without asking for verification documents', async () => {
      const saved = await service.create('user-1', {
        legalName: 'Test LLC',
        displayName: 'Test Space',
        category: 'Coworking',
      });

      expect(saved.verificationStatus).toBe(
        ProviderVerificationStatus.VERIFIED,
      );
      expect(saved.verificationDocuments).toEqual([]);
      expect(roleRepo.rows).toEqual([
        expect.objectContaining({
          userId: 'user-1',
          role: 'PROVIDER_OWNER',
          providerId: saved.id,
        }),
      ]);
      expect(verificationEventRepo.rows).toEqual([
        expect.objectContaining({
          providerId: saved.id,
          status: ProviderVerificationStatus.VERIFIED,
          reviewedByUserId: null,
          notes: 'Provider self-registered without document verification.',
        }),
      ]);
    });

    it('keeps generated provider slugs unique', async () => {
      const first = await service.create('user-1', {
        legalName: 'Test LLC',
        displayName: 'Test Space',
      });
      const second = await service.create('user-2', {
        legalName: 'Second LLC',
        displayName: 'Test Space',
      });

      expect(first.slug).toBe('test-space');
      expect(second.slug).toBe('test-space-1');
    });
  });
});
