import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import {
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentProvider,
  RefundResult,
} from './payment-provider.interface';

/**
 * 13_PAYMENT_ARCHITECTURE.md §13.4 — Payriff is the SECONDARY/BACKUP
 * hosted-checkout option only ("no marketplace capability was found for
 * it, and its webhook signature story is unverified"). 18_SECURITY.md
 * §18.3 is explicit about the consequence: "if Payriff's callback
 * signature mechanism remains unverified/undocumented by launch, the
 * integration additionally re-confirms via Payriff's getOrderInformation()
 * lookup API rather than trusting the callback payload alone — never
 * process a financial state change from an unverified/unconfirmed source."
 *
 * Because that signature scheme is still undocumented and no lookup-API
 * credentials were available at Phase 4 implementation time,
 * `verifyWebhookSignature` always fails closed (returns false) here —
 * by design, not as a bug — and PaymentsService must never process a
 * Payriff webhook on signature alone. `confirmViaLookup` is where the real
 * getOrderInformation() call belongs once credentials exist; until then it
 * throws in production and only simulates success in dev/test, exactly
 * like EpointPaymentProvider's unconfigured-credentials behavior.
 */
@Injectable()
export class PayriffPaymentProvider implements PaymentProvider {
  readonly name = 'PAYRIFF' as const;
  private readonly logger = new Logger(PayriffPaymentProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private isConfigured(): boolean {
    return (
      !!this.configService.get<string>('payments.payriff.secretKey') &&
      !!this.configService.get<string>('payments.payriff.publicKey')
    );
  }

  async createCheckoutSession(params: {
    ourReference: string;
    amount: number;
    currency: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<CheckoutSession> {
    if (this.isConfigured()) {
      throw new Error(
        'PAYRIFF_LIVE_API_NOT_IMPLEMENTED — REQUIRES USER ACTION.',
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PAYRIFF_NOT_CONFIGURED — REQUIRES USER ACTION (13_PAYMENT_ARCHITECTURE.md §13.4).',
      );
    }
    const externalReference = `dev-payriff-${randomUUID()}`;
    this.logger.warn(
      `[DEV] Payriff not configured — returning a fake checkout session for ${params.ourReference}.`,
    );
    return {
      checkoutUrl: `${params.successUrl}?dev_fake_checkout=true&ref=${externalReference}`,
      externalReference,
    };
  }

  /**
   * Always false — by design (see class comment). Payriff's signature
   * scheme is undocumented, so it is never trusted on its own;
   * PaymentsService must route Payriff webhooks through
   * `confirmViaLookup()` instead of relying on this returning true.
   */
  verifyWebhookSignature(
    _rawPayload: Buffer | string,
    _signatureHeader: string | undefined,
  ): boolean {
    return false;
  }

  parseWebhookEvent(rawPayload: Buffer | string): NormalizedPaymentEvent {
    const body = JSON.parse(
      typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf8'),
    );
    const statusMap: Record<string, NormalizedPaymentEvent['type']> = {
      approved: 'CHARGE_SUCCEEDED',
      declined: 'CHARGE_FAILED',
      refunded: 'REFUND_SUCCEEDED',
    };
    const type = statusMap[String(body.status).toLowerCase()];
    if (!type)
      throw new Error(
        `PAYRIFF_UNKNOWN_STATUS — unrecognized webhook status "${body.status}".`,
      );
    return {
      type,
      externalReference: String(body.transactionId ?? body.orderId),
      ourReference: String(body.orderId),
      amount: Math.round(Number(body.amount) * 100),
      currency: String(body.currency ?? 'AZN'),
      gatewayResponseCode: body.status ? String(body.status) : undefined,
    };
  }

  /**
   * The trusted confirmation path for Payriff (§18.3) — an out-of-band
   * lookup against Payriff's own API, independent of the untrusted
   * callback payload. NOT the same method as the PaymentProvider
   * interface's `verifyWebhookSignature`; PaymentsService calls this
   * explicitly for the PAYRIFF adapter before acting on any webhook.
   */
  async confirmViaLookup(orderId: string): Promise<boolean> {
    if (this.isConfigured()) {
      throw new Error(
        'PAYRIFF_LOOKUP_API_NOT_IMPLEMENTED — REQUIRES USER ACTION.',
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PAYRIFF_NOT_CONFIGURED — cannot confirm a Payriff webhook without lookup-API credentials.',
      );
    }
    this.logger.warn(
      `[DEV] Simulating Payriff getOrderInformation() confirmation for order ${orderId}.`,
    );
    return true;
  }

  async refund(
    externalReference: string,
    amount: number,
    currency: string,
  ): Promise<RefundResult> {
    if (this.isConfigured()) {
      throw new Error(
        'PAYRIFF_LIVE_API_NOT_IMPLEMENTED — REQUIRES USER ACTION.',
      );
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'PAYRIFF_NOT_CONFIGURED — cannot process a real refund without credentials.',
      );
    }
    this.logger.warn(
      `[DEV] Simulating Payriff refund of ${amount} ${currency} for ${externalReference}.`,
    );
    return { success: true, externalReference: `dev-refund-${randomUUID()}` };
  }
}
