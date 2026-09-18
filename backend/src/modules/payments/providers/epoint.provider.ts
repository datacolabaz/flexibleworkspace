import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

import {
  CheckoutSession,
  NormalizedPaymentEvent,
  PaymentProvider,
  RefundResult,
} from './payment-provider.interface';

/**
 * 13_PAYMENT_ARCHITECTURE.md §13.4 — Epoint is the primary V1 provider
 * (documented SHA1 HMAC webhook signature, real refund API; split-payment
 * exists but is NOT relied on for V1 settlement per §13.4's "does not
 * assume split-payment works end-to-end on day one").
 *
 * REQUIRES USER ACTION for production use: `createCheckoutSession()` and
 * `refund()` need a live HTTP call against Epoint's actual API, whose exact
 * request/response field names and the precise byte-for-byte construction
 * of their signature ("SHA1 HMAC" per our own architecture doc, but the
 * specific concatenation order/encoding used by Epoint's SDK) must be
 * confirmed directly against Epoint's merchant documentation/SDK once
 * merchant credentials exist — none were available at Phase 4
 * implementation time (see PHASE4_REPORT.md). `verifyWebhookSignature`
 * implements the documented general shape (HMAC-SHA1 over the raw payload,
 * keyed by the merchant secret) so it is real, working crypto — not a
 * stub — but the exact payload-to-string construction must be verified
 * against a real Epoint webhook sample before launch.
 */
@Injectable()
export class EpointPaymentProvider implements PaymentProvider {
  readonly name = 'EPOINT' as const;
  private readonly logger = new Logger(EpointPaymentProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private get secretKey(): string {
    return this.configService.get<string>('payments.epoint.secretKey') || '';
  }

  private get merchantId(): string {
    return this.configService.get<string>('payments.epoint.merchantId') || '';
  }

  private isConfigured(): boolean {
    return !!this.secretKey && !!this.merchantId;
  }

  async createCheckoutSession(params: {
    ourReference: string;
    amount: number;
    currency: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<CheckoutSession> {
    if (!this.isConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'EPOINT_NOT_CONFIGURED — Epoint merchant credentials are missing (REQUIRES USER ACTION, 13_PAYMENT_ARCHITECTURE.md §13.4). Refusing to fabricate a checkout session in production.',
        );
      }
      // Development/test only — a deterministic fake checkout URL so the
      // rest of the booking->payment->webhook flow is fully exercisable
      // without live Epoint credentials, matching SmsChannel's dev-mode pattern.
      const externalReference = `dev-epoint-${randomUUID()}`;
      this.logger.warn(
        `[DEV] Epoint not configured — returning a fake checkout session for ${params.ourReference} (external ref ${externalReference}).`,
      );
      return {
        checkoutUrl: `${params.successUrl}?dev_fake_checkout=true&ref=${externalReference}`,
        externalReference,
      };
    }

    // REQUIRES USER ACTION: real Epoint API call goes here once credentials
    // and the exact API contract are confirmed. Left unimplemented rather
    // than guessed, per the established discipline (S3StorageProvider,
    // SmsChannel) of never faking a real external integration.
    throw new Error(
      'EPOINT_LIVE_API_NOT_IMPLEMENTED — Epoint credentials are present but the live checkout-session HTTP call is not implemented (REQUIRES USER ACTION — confirm exact API contract with Epoint before implementing).',
    );
  }

  /**
   * HMAC-SHA1 over the raw payload, keyed by the merchant secret — the
   * general shape §13.4/§18.3 document for Epoint. Fails closed: any
   * missing signature, missing config, or mismatch returns false, never
   * throws (callers must be able to always reach a clean 400).
   */
  verifyWebhookSignature(
    rawPayload: Buffer | string,
    signatureHeader: string | undefined,
  ): boolean {
    if (!signatureHeader || !this.secretKey) return false;
    try {
      const expected = createHmac('sha1', this.secretKey)
        .update(rawPayload)
        .digest('base64');
      const expectedBuf = Buffer.from(expected);
      const actualBuf = Buffer.from(signatureHeader);
      if (expectedBuf.length !== actualBuf.length) return false;
      return timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  parseWebhookEvent(rawPayload: Buffer | string): NormalizedPaymentEvent {
    // REQUIRES USER ACTION: field names below (status/order_id/amount/
    // currency) are our best-effort mapping pending a real Epoint webhook
    // sample; verifyWebhookSignature() must always run and reject BEFORE
    // this is ever called, so a malformed/forged payload never reaches here.
    const body = JSON.parse(
      typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf8'),
    );
    const statusMap: Record<string, NormalizedPaymentEvent['type']> = {
      success: 'CHARGE_SUCCEEDED',
      approved: 'CHARGE_SUCCEEDED',
      failed: 'CHARGE_FAILED',
      declined: 'CHARGE_FAILED',
      refunded: 'REFUND_SUCCEEDED',
      refund_failed: 'REFUND_FAILED',
    };
    const type = statusMap[String(body.status).toLowerCase()];
    if (!type) {
      throw new Error(
        `EPOINT_UNKNOWN_STATUS — unrecognized webhook status "${body.status}".`,
      );
    }
    return {
      type,
      externalReference: String(body.transaction_id ?? body.order_id),
      ourReference: String(body.order_id),
      amount: Math.round(Number(body.amount) * 100), // Epoint amounts are documented in major units; convert to minor units (qəpik)
      currency: String(body.currency ?? 'AZN'),
      gatewayResponseCode: body.status ? String(body.status) : undefined,
    };
  }

  async refund(
    externalReference: string,
    amount: number,
    currency: string,
  ): Promise<RefundResult> {
    if (!this.isConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'EPOINT_NOT_CONFIGURED — cannot process a real refund without merchant credentials.',
        );
      }
      this.logger.warn(
        `[DEV] Simulating Epoint refund of ${amount} ${currency} for ${externalReference}.`,
      );
      return { success: true, externalReference: `dev-refund-${randomUUID()}` };
    }
    throw new Error(
      'EPOINT_LIVE_API_NOT_IMPLEMENTED — the live refund HTTP call is not implemented (REQUIRES USER ACTION).',
    );
  }

  /** Exposed for completeness/testing of the hashing primitive itself — not part of the PaymentProvider interface. */
  static sha1Hex(input: string): string {
    return createHash('sha1').update(input).digest('hex');
  }
}
