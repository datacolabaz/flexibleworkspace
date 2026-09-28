import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

import {
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentProvider,
  RefundResult,
} from './payment-provider.interface';

/**
 * Staging/test hosted-checkout stand-in. No cards, no outbound gateway
 * HTTP. Confirmation happens only via `PaymentsService.completeFakePayment`
 * (server-side), never from the browser redirect alone.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'FAKE' as const;
  private readonly logger = new Logger(FakePaymentProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private signingSecret(): string {
    return (
      this.configService.get<string>('payments.fake.secret') ||
      this.configService.get<string>('jwt.accessSecret') ||
      'dev-only-fake-payments-secret'
    );
  }

  signPaymentId(paymentId: string): string {
    return createHmac('sha256', this.signingSecret())
      .update(paymentId)
      .digest('hex');
  }

  verifyCompleteSignature(
    paymentId: string,
    signature: string | undefined,
  ): boolean {
    if (!signature) return false;
    try {
      const expected = Buffer.from(this.signPaymentId(paymentId), 'hex');
      const actual = Buffer.from(signature, 'hex');
      if (expected.length !== actual.length) return false;
      return timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  stableExternalReference(paymentId: string): string {
    return `fake:${paymentId}`;
  }

  buildChargeSucceededEvent(params: {
    paymentId: string;
    amountMinorUnits: number;
    currency: string;
  }): NormalizedPaymentEvent {
    return {
      type: 'CHARGE_SUCCEEDED',
      externalReference: this.stableExternalReference(params.paymentId),
      ourReference: params.paymentId,
      amount: params.amountMinorUnits,
      currency: params.currency,
      gatewayResponseCode: 'FAKE_SUCCESS',
    };
  }

  async createCheckoutSession(params: {
    ourReference: string;
    amount: number;
    currency: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<CheckoutSession> {
    void params.amount;
    void params.currency;
    void params.errorUrl;
    const sig = this.signPaymentId(params.ourReference);
    const sep = params.successUrl.includes('?') ? '&' : '?';
    const checkoutUrl = `${params.successUrl}${sep}fake_complete=1&paymentId=${encodeURIComponent(params.ourReference)}&sig=${sig}`;
    this.logger.warn(
      `[STAGING] FakePaymentAdapter checkout for ${params.ourReference} — no gateway HTTP.`,
    );
    return {
      checkoutUrl,
      externalReference: this.stableExternalReference(params.ourReference),
    };
  }

  verifyWebhookSignature(
    rawPayload: Buffer | string,
    signatureHeader: string | undefined,
  ): boolean {
    if (!signatureHeader) return false;
    try {
      const expected = createHmac('sha256', this.signingSecret())
        .update(rawPayload)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const actualBuf = Buffer.from(signatureHeader, 'hex');
      if (expectedBuf.length !== actualBuf.length) return false;
      return timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawPayload: Buffer | string): NormalizedPaymentEvent {
    const body = JSON.parse(
      typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf8'),
    );
    return this.buildChargeSucceededEvent({
      paymentId: String(body.ourReference ?? body.paymentId),
      amountMinorUnits: Number(body.amount),
      currency: String(body.currency ?? 'AZN'),
    });
  }

  async refund(
    externalReference: string,
    amount: number,
    currency: string,
  ): Promise<RefundResult> {
    this.logger.warn(
      `[STAGING] FakePaymentAdapter refund of ${amount} ${currency} for ${externalReference} — no gateway HTTP.`,
    );
    return {
      success: true,
      externalReference: `${externalReference}:refund`,
      gatewayResponseCode: 'FAKE_REFUND',
    };
  }
}
