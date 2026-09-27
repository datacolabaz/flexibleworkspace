import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { ReferralLinksService } from './referral-links.service';
import { ReferralLinkEntity } from './entities/referral-link.entity';
import { ReferralLinkClickEntity } from './entities/referral-link-click.entity';
import { DomainException } from '../../common/exceptions/domain.exception';

describe('ReferralLinksService ownership', () => {
  let service: ReferralLinksService;
  const dataSource = {
    query: jest.fn(),
  };
  const linkRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((d) => d),
    save: jest.fn(async (d) => ({ id: 'link-1', ...d })),
    increment: jest.fn(),
  };
  const clickRepo = {
    create: jest.fn((d) => d),
    save: jest.fn(async (d) => d),
  };

  beforeEach(async () => {
    dataSource.query.mockReset();
    linkRepo.findOne.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        ReferralLinksService,
        { provide: getRepositoryToken(ReferralLinkEntity), useValue: linkRepo },
        {
          provide: getRepositoryToken(ReferralLinkClickEntity),
          useValue: clickRepo,
        },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = module.get(ReferralLinksService);
  });

  it('rejects a provider link for another provider location', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(
      service.createForProvider('prov-a', {
        destinationType: 'location',
        destinationId: 'loc-other',
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it('rejects an organizer link for someone else event', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(
      service.createForOrganizer('user-a', {
        destinationType: 'event',
        destinationId: 'event-other',
      }),
    ).rejects.toBeInstanceOf(DomainException);
  });

  it('creates a provider location link after ownership check', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'loc-1' }])
      .mockResolvedValueOnce([]);
    linkRepo.findOne.mockResolvedValue(null);
    const link = await service.createForProvider('prov-a', {
      destinationType: 'location',
      destinationId: 'loc-1',
    });
    expect(link.ownerId).toBe('prov-a');
    expect(link.destinationId).toBe('loc-1');
  });
});
