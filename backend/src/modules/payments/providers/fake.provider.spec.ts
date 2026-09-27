import { createHmac } from 'crypto';

import { FakePaymentProvider } from './fake.provider';

class FakeConfigService {
  constructor(private readonly values: Record<string, string> = {}) {}
  get<T = string>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

describe('FakePaymentProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a signed staging checkout URL and never calls fetch/HTTP', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as any;
    const provider = new FakePaymentProvider(
      new FakeConfigService({
        'payments.fake.secret': 'fake-secret',
      }) as any,
    );

    const session = await provider.createCheckoutSession({
      ourReference: '11111111-1111-1111-1111-111111111111',
      amount: 5000,
      currency: 'AZN',
      successUrl: 'https://app.test/booking/b1/confirming',
      errorUrl: 'https://app.test/booking/b1/failed',
    });

    expect(session.checkoutUrl).toContain('fake_complete=1');
    expect(session.checkoutUrl).toContain(
      'paymentId=11111111-1111-1111-1111-111111111111',
    );
    expect(session.externalReference).toBe(
      'fake:11111111-1111-1111-1111-111111111111',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      provider.verifyCompleteSignature(
        '11111111-1111-1111-1111-111111111111',
        new URL(session.checkoutUrl).searchParams.get('sig') ?? undefined,
      ),
    ).toBe(true);
  });

  it('rejects a tampered complete signature', () => {
    const provider = new FakePaymentProvider(
      new FakeConfigService({ 'payments.fake.secret': 'fake-secret' }) as any,
    );
    const good = provider.signPaymentId('pay-1');
    const bad = createHmac('sha256', 'other').update('pay-1').digest('hex');
    expect(provider.verifyCompleteSignature('pay-1', good)).toBe(true);
    expect(provider.verifyCompleteSignature('pay-1', bad)).toBe(false);
    expect(provider.verifyCompleteSignature('pay-1', undefined)).toBe(false);
  });
});
