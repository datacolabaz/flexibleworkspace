import { PriceQuoteService } from './price-quote.service';
import { PriceType, PriceUnitType } from '../../common/constants/pricing.enum';

describe('PriceQuoteService', () => {
  it('does not invent a daily rate from hourly', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (String(sql).includes('FROM room_price_package')) {
          return [
            {
              unit_type: PriceUnitType.HOURLY,
              amount: '5000',
              currency: 'AZN',
              price_type: PriceType.EXACT,
              last_updated_at: new Date(),
              notes: null,
              active: true,
              valid_from: null,
              valid_until: null,
            },
          ];
        }
        return [];
      }),
    };
    const service = new PriceQuoteService(dataSource as any);
    const start = new Date('2026-10-01T09:00:00Z');
    const end = new Date('2026-10-02T09:00:00Z');
    const quote = await service.quote('room-1', start, end);
    expect(quote.unitType).toBe(PriceUnitType.DAILY);
    expect(quote.priceType).toBe(PriceType.NOT_AVAILABLE);
    expect(quote.amount).toBeNull();
  });

  it('uses hourly package × duration hours for sub-day bookings', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (String(sql).includes('FROM room_price_package')) {
          return [
            {
              unit_type: PriceUnitType.HOURLY,
              amount: '3000',
              currency: 'AZN',
              price_type: PriceType.EXACT,
              last_updated_at: new Date(),
              notes: null,
              active: true,
              valid_from: null,
              valid_until: null,
            },
          ];
        }
        return [];
      }),
    };
    const service = new PriceQuoteService(dataSource as any);
    const start = new Date('2026-10-01T10:00:00Z');
    const end = new Date('2026-10-01T12:00:00Z');
    const quote = await service.quote('room-1', start, end);
    expect(quote.unitType).toBe(PriceUnitType.HOURLY);
    expect(quote.amount).toBe(6000);
    expect(quote.quantity).toBe(2);
  });
});
