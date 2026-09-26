import { ProvidersService } from './providers.service';
import {
  ProviderPlanTier,
  ProviderVerificationDocumentType,
  ProviderVerificationStatus,
} from '../../common/constants/provider.enum';

/**
 * Deterministic in-memory repository doubles, matching the project's
 * established testing philosophy (see rooms.service.spec.ts). Only the
 * Repository methods ProvidersService actually calls are implemented.
 */
function makeProviderRepoDouble() {
  const rows: any[] = [];
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.id) return rows.find((r) => r.id === where.id) ?? null;
      return null;
    }),
    save: jest.fn(async (entity: any) => {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
      return entity;
    }),
  };
}

function makeDocumentHashRepoDouble() {
  const rows: any[] = [];
  let autoId = 0;
  return {
    rows,
    findOne: jest.fn(
      async ({ where }: any) =>
        rows.find((r) => r.fileHash === where.fileHash) ?? null,
    ),
    create: (data: any) => ({ id: `hash-${++autoId}`, ...data }),
    save: jest.fn(async (entity: any) => {
      rows.push(entity);
      return entity;
    }),
  };
}

function makeVerificationEventRepoDouble() {
  const rows: any[] = [];
  return {
    rows,
    create: (data: any) => ({ ...data }),
    save: jest.fn(async (entity: any) => {
      rows.push(entity);
      return entity;
    }),
  };
}

function makeProvider(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? 'provider-1',
    legalName: 'Test LLC',
    displayName: 'Test',
    slug: 'test',
    ownerUserId: 'user-1',
    category: null,
    taxId: null,
    verificationStatus: ProviderVerificationStatus.PENDING,
    verificationDocuments: [],
    planTier: ProviderPlanTier.FREE,
    bankAccountDetails: null,
    logoStorageKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('ProvidersService', () => {
  let providerRepo: ReturnType<typeof makeProviderRepoDouble>;
  let documentHashRepo: ReturnType<typeof makeDocumentHashRepoDouble>;
  let verificationEventRepo: ReturnType<typeof makeVerificationEventRepoDouble>;
  let privateStorageProvider: any;
  let service: ProvidersService;

  beforeEach(() => {
    providerRepo = makeProviderRepoDouble();
    documentHashRepo = makeDocumentHashRepoDouble();
    verificationEventRepo = makeVerificationEventRepoDouble();
    privateStorageProvider = {
      put: jest.fn(async () => ({
        storageKey: 'stored-key',
        publicUrl: '',
      })),
    };

    service = new ProvidersService(
      providerRepo as any,
      verificationEventRepo as any,
      documentHashRepo as any,
      {} as any, // roleRepo — unused by the methods under test
      {} as any, // auditLogService
      privateStorageProvider,
      {} as any, // publicStorageProvider — unused by the methods under test
      {} as any, // configService — unused by the methods under test
    );
  });

  describe('addVerificationDocument() — duplicate-document fraud check (2026-09-23)', () => {
    const file = {
      buffer: Buffer.from('same bytes'),
      originalname: 'id.jpg',
      mimetype: 'image/jpeg',
    };

    it('auto-verifies a PENDING provider the moment a non-duplicate document is accepted', async () => {
      providerRepo.rows.push(makeProvider({ id: 'p1' }));
      const saved = await service.addVerificationDocument(
        'p1',
        ProviderVerificationDocumentType.ID_DOCUMENT,
        file,
      );
      expect(saved.verificationStatus).toBe(
        ProviderVerificationStatus.VERIFIED,
      );
      expect(saved.verificationDocuments).toHaveLength(1);
      expect(verificationEventRepo.rows).toHaveLength(1);
      expect(verificationEventRepo.rows[0]).toMatchObject({
        providerId: 'p1',
        status: ProviderVerificationStatus.VERIFIED,
        reviewedByUserId: null,
      });
    });

    it('does not re-trigger auto-verification (or write a second event) once already VERIFIED', async () => {
      providerRepo.rows.push(
        makeProvider({
          id: 'p2',
          verificationStatus: ProviderVerificationStatus.VERIFIED,
        }),
      );
      await service.addVerificationDocument(
        'p2',
        ProviderVerificationDocumentType.ADDRESS_PROOF,
        { ...file, buffer: Buffer.from('different bytes') },
      );
      expect(verificationEventRepo.rows).toHaveLength(0);
    });

    it('does not override an admin REJECTED decision just because a new document arrives', async () => {
      providerRepo.rows.push(
        makeProvider({
          id: 'p3',
          verificationStatus: ProviderVerificationStatus.REJECTED,
        }),
      );
      const saved = await service.addVerificationDocument(
        'p3',
        ProviderVerificationDocumentType.OTHER,
        { ...file, buffer: Buffer.from('rejected-provider bytes') },
      );
      expect(saved.verificationStatus).toBe(
        ProviderVerificationStatus.REJECTED,
      );
      expect(verificationEventRepo.rows).toHaveLength(0);
    });

    it('rejects a document whose exact bytes are already on file for a DIFFERENT provider', async () => {
      providerRepo.rows.push(makeProvider({ id: 'p4' }));
      providerRepo.rows.push(makeProvider({ id: 'p5' }));
      await service.addVerificationDocument(
        'p4',
        ProviderVerificationDocumentType.ID_DOCUMENT,
        file,
      );

      await expect(
        service.addVerificationDocument(
          'p5',
          ProviderVerificationDocumentType.ID_DOCUMENT,
          file,
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_DOCUMENT' });

      // The second provider must not have been auto-verified or had the
      // document recorded — the whole upload is rejected, not partially applied.
      const p5 = providerRepo.rows.find((r) => r.id === 'p5');
      expect(p5.verificationStatus).toBe(ProviderVerificationStatus.PENDING);
      expect(p5.verificationDocuments).toHaveLength(0);
      expect(privateStorageProvider.put).toHaveBeenCalledTimes(1); // only p4's upload reached storage
    });

    it('allows the SAME provider to re-upload the exact same file (e.g. fixing the document type)', async () => {
      providerRepo.rows.push(makeProvider({ id: 'p6' }));
      await service.addVerificationDocument(
        'p6',
        ProviderVerificationDocumentType.ID_DOCUMENT,
        file,
      );
      await expect(
        service.addVerificationDocument(
          'p6',
          ProviderVerificationDocumentType.OTHER,
          file,
        ),
      ).resolves.toBeDefined();
      const p6 = providerRepo.rows.find((r) => r.id === 'p6');
      expect(p6.verificationDocuments).toHaveLength(2);
    });
  });
});
