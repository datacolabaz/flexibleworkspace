import { isFakePaymentsEnabled } from './fake-payments.gate';

describe('isFakePaymentsEnabled', () => {
  it('never selects fake in production, even if keys are unset and FAKE_PAYMENTS=true', () => {
    expect(isFakePaymentsEnabled('production', undefined)).toBe(false);
    expect(isFakePaymentsEnabled('production', 'true')).toBe(false);
    expect(isFakePaymentsEnabled('production', 'false')).toBe(false);
  });

  it('selects fake in staging and test without an extra flag', () => {
    expect(isFakePaymentsEnabled('staging')).toBe(true);
    expect(isFakePaymentsEnabled('test')).toBe(true);
    expect(isFakePaymentsEnabled('staging', 'false')).toBe(true);
  });

  it('selects fake in development only with the explicit FAKE_PAYMENTS=true flag', () => {
    expect(isFakePaymentsEnabled('development')).toBe(false);
    expect(isFakePaymentsEnabled('development', 'true')).toBe(true);
    expect(isFakePaymentsEnabled(undefined, 'true')).toBe(true);
  });
});
