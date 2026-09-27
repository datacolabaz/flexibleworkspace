import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';

import { CommissionService } from './commission.service';
import { PaymentAdapterName } from '../../common/constants/payment.enum';

describe('CommissionService billing-unit rules', () => {
  const config = { get: jest.fn(() => 12) } as unknown as ConfigService;
  const service = new CommissionService(config);

  function managerWithRule(percentage: number, billingUnit: string | null) {
    return {
      query: jest.fn(async (sql: string) => {
        if (String(sql).includes('booking_referral_attribution')) return [];
        return [
          {
            id: 'rule-1',
            scope: 'PLATFORM_DEFAULT',
            provider_id: null,
            room_type_id: null,
            percentage,
            fixed_fee_amount: null,
            fixed_fee_currency: null,
            priority: 20,
            billing_unit: billingUnit,
          },
        ];
      }),
    } as unknown as EntityManager;
  }

  it('100 AZN daily → 12 platform / 88 provider remainder before gateway fee', async () => {
    const result = await service.buildLedgerEntriesForConfirmedBooking(
      managerWithRule(12, 'DAILY'),
      {
        bookingId: 'b1',
        providerId: 'p1',
        roomTypeId: 'rt1',
        billingUnit: 'DAILY',
        grossAmount: 10000,
        currency: 'AZN',
        paymentAdapter: PaymentAdapterName.PAYRIFF,
      },
    );
    expect(result.platformFeeAmount).toBe(1200);
    expect(10000 - result.platformFeeAmount).toBe(8800);
  });

  it('100 AZN weekly → 10 / 90', async () => {
    const result = await service.buildLedgerEntriesForConfirmedBooking(
      managerWithRule(10, 'WEEKLY'),
      {
        bookingId: 'b1',
        providerId: 'p1',
        roomTypeId: 'rt1',
        billingUnit: 'WEEKLY',
        grossAmount: 10000,
        currency: 'AZN',
        paymentAdapter: PaymentAdapterName.PAYRIFF,
      },
    );
    expect(result.platformFeeAmount).toBe(1000);
    expect(10000 - result.platformFeeAmount).toBe(9000);
  });

  it('100 AZN monthly → 8 / 92', async () => {
    const result = await service.buildLedgerEntriesForConfirmedBooking(
      managerWithRule(8, 'MONTHLY'),
      {
        bookingId: 'b1',
        providerId: 'p1',
        roomTypeId: 'rt1',
        billingUnit: 'MONTHLY',
        grossAmount: 10000,
        currency: 'AZN',
        paymentAdapter: PaymentAdapterName.PAYRIFF,
      },
    );
    expect(result.platformFeeAmount).toBe(800);
    expect(10000 - result.platformFeeAmount).toBe(9200);
  });
});
