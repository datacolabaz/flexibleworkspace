import { createHmac } from 'crypto';

import { EpointPaymentProvider } from './epoint.provider';
import { PayriffPaymentProvider } from './payriff.provider';

/**
 * Unit-level coverage for the one piece of provider logic that's pure
 * crypto and deterministic in isolation: signature verification. Everything
 * else on these adapters (checkout/refund HTTP calls) is either
 * dev-simulated or throws LIVE_API_NOT_IMPLEMENTED (13_PAYMENT_ARCHITECTURE.md
 * §13.4) and is exercised end-to-end against real Postgres in
 * test/payments.e2e-spec.ts instead. No repository/DB dependency here, so a
 * real in-memory fake ConfigService is enough — no mocking framework needed.
 */
class FakeConfigService {
  constructor(private readonly values: Record<string, string> = {}) {}
  get<T = string>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

describe('EpointPaymentProvider.verifyWebhookSignature (18_SECURITY.md §18.3 — real HMAC-SHA1)', () => {
  const secretKey = 'epoint-test-secret';
  const payload = Buffer.from(
    JSON.stringify({
      status: 'success',
      order_id: 'ord-1',
      transaction_id: 'txn-1',
      amount: 12.34,
      currency: 'AZN',
    }),
  );

  function makeProvider(config: Record<string, string> = {}) {
    return new EpointPaymentProvider(new FakeConfigService(config) as any);
  }

  it('accepts a correctly-computed HMAC-SHA1(secretKey, rawPayload) base64 signature', () => {
    const provider = makeProvider({
      'payments.epoint.secretKey': secretKey,
      'payments.epoint.merchantId': 'merchant-1',
    });
    const validSignature = createHmac('sha1', secretKey)
      .update(payload)
      .digest('base64');

    expect(provider.verifyWebhookSignature(payload, validSignature)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const provider = makeProvider({
      'payments.epoint.secretKey': secretKey,
      'payments.epoint.merchantId': 'merchant-1',
    });
    const wrongSignature = createHmac('sha1', 'a-different-secret')
      .update(payload)
      .digest('base64');

    expect(provider.verifyWebhookSignature(payload, wrongSignature)).toBe(
      false,
    );
  });

  it('rejects a signature computed over a tampered payload (amount changed after signing)', () => {
    const provider = makeProvider({
      'payments.epoint.secretKey': secretKey,
      'payments.epoint.merchantId': 'merchant-1',
    });
    const validSignature = createHmac('sha1', secretKey)
      .update(payload)
      .digest('base64');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        status: 'success',
        order_id: 'ord-1',
        transaction_id: 'txn-1',
        amount: 999.99,
        currency: 'AZN',
      }),
    );

    expect(
      provider.verifyWebhookSignature(tamperedPayload, validSignature),
    ).toBe(false);
  });

  it('rejects when no signature header is present', () => {
    const provider = makeProvider({
      'payments.epoint.secretKey': secretKey,
      'payments.epoint.merchantId': 'merchant-1',
    });

    expect(provider.verifyWebhookSignature(payload, undefined)).toBe(false);
  });

  it('fails closed (never throws, never accepts) when no secret is configured', () => {
    const provider = makeProvider({}); // no secretKey/merchantId at all
    const someSignature = createHmac('sha1', 'irrelevant')
      .update(payload)
      .digest('base64');

    expect(() =>
      provider.verifyWebhookSignature(payload, someSignature),
    ).not.toThrow();
    expect(provider.verifyWebhookSignature(payload, someSignature)).toBe(false);
  });

  it('rejects a garbage/non-base64 signature header without throwing', () => {
    const provider = makeProvider({
      'payments.epoint.secretKey': secretKey,
      'payments.epoint.merchantId': 'merchant-1',
    });

    expect(() =>
      provider.verifyWebhookSignature(payload, 'not-a-real-signature'),
    ).not.toThrow();
    expect(
      provider.verifyWebhookSignature(payload, 'not-a-real-signature'),
    ).toBe(false);
  });
});

describe('PayriffPaymentProvider.verifyWebhookSignature (always false by design — 13_PAYMENT_ARCHITECTURE.md §13.4/18_SECURITY.md §18.3)', () => {
  it('returns false even for a well-formed-looking signature, since the real scheme is undocumented and PaymentsService must route Payriff through confirmViaLookup() instead', () => {
    const provider = new PayriffPaymentProvider(
      new FakeConfigService({}) as any,
    );
    const payload = Buffer.from(
      JSON.stringify({
        status: 'approved',
        orderId: 'ord-1',
        transactionId: 'txn-1',
        amount: 12.34,
        currency: 'AZN',
      }),
    );

    expect(provider.verifyWebhookSignature(payload, 'anything-at-all')).toBe(
      false,
    );
    expect(provider.verifyWebhookSignature(payload, undefined)).toBe(false);
  });
});
