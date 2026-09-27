import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { CommissionService } from './commission.service';
import { LedgerEntryType } from '../../common/constants/payment.enum';

describe('CommissionService', () => {
  let service: CommissionService;
  let manager: { query: jest.Mock };

  beforeEach(async () => {
    manager = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CommissionService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(12) },
        },
      ],
    }).compile();
    service = module.get(CommissionService);
  });

  it('builds GROSS / PLATFORM_FEE / PROCESSING_FEE / PROVIDER_NET from the server gross amount', async () => {
    manager.query
      .mockResolvedValueOnce([]) // no matching commission_rule
      .mockResolvedValueOnce([]); // no partner attribution

    const result = await service.buildLedgerEntriesForConfirmedBooking(
      manager as unknown as EntityManager,
      {
        bookingId: 'booking-1',
        providerId: 'provider-1',
        roomTypeId: 'room-type-1',
        grossAmount: 10000,
        currency: 'AZN',
        paymentAdapter: 'PAYRIFF' as any,
      },
    );

    const byType = Object.fromEntries(
      result.entries.map((e) => [e.entryType, Number(e.amount)]),
    );
    expect(byType[LedgerEntryType.GROSS]).toBe(10000);
    expect(byType[LedgerEntryType.PLATFORM_FEE]).toBe(-1200);
    expect(byType[LedgerEntryType.PROCESSING_FEE]).toBe(-300);
    expect(byType[LedgerEntryType.PROVIDER_NET]).toBe(8500);
    expect(result.entries.every((e) => e.bookingId === 'booking-1')).toBe(true);
  });

  it('tags fake adapter ledger rows and charges no gateway processing fee', async () => {
    manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.buildLedgerEntriesForConfirmedBooking(
      manager as unknown as EntityManager,
      {
        bookingId: 'booking-fake',
        providerId: 'provider-1',
        roomTypeId: 'room-type-1',
        grossAmount: 10000,
        currency: 'AZN',
        paymentAdapter: 'FAKE' as any,
        ledgerSourceTag: 'fake:staging',
      },
    );

    const processing = result.entries.find(
      (e) => e.entryType === LedgerEntryType.PROCESSING_FEE,
    );
    expect(Number(processing?.amount)).toBe(0);
    expect(result.entries.every((e) => e.referralSource === 'fake:staging')).toBe(
      true,
    );
  });
});
