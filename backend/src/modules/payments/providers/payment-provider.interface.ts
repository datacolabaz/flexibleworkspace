export interface CheckoutSession {
  checkoutUrl: string;
  externalReference: string;
}

export type NormalizedPaymentEventType =
  'CHARGE_SUCCEEDED' | 'CHARGE_FAILED' | 'REFUND_SUCCEEDED' | 'REFUND_FAILED';

export interface NormalizedPaymentEvent {
  type: NormalizedPaymentEventType;
  /** The gateway's own transaction/order id — becomes payment_transaction.external_reference, the idempotency key (§10.7). */
  externalReference: string;
  /** The reference we handed the gateway when creating the checkout session, so we can find our own Payment row again. */
  ourReference: string;
  amount: number; // minor units
  currency: string;
  gatewayResponseCode?: string;
}

export interface RefundResult {
  success: boolean;
  externalReference: string;
  gatewayResponseCode?: string;
}

/**
 * 13_PAYMENT_ARCHITECTURE.md §13.2 — no booking, ledger, or notification
 * code ever references Epoint/Payriff directly; everything talks to this
 * interface. Adding a new provider is a new adapter class, never a change
 * to PaymentsService/RefundsService.
 */
export interface PaymentProvider {
  readonly name: 'EPOINT' | 'PAYRIFF';

  createCheckoutSession(params: {
    ourReference: string;
    amount: number; // minor units
    currency: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<CheckoutSession>;

  /**
   * Fails closed (18_SECURITY.md §18.3): returns false on any malformed,
   * missing, or mismatched signature. Callers must never process a state
   * change when this returns false.
   */
  verifyWebhookSignature(
    rawPayload: Buffer | string,
    signatureHeader: string | undefined,
  ): boolean;

  parseWebhookEvent(rawPayload: Buffer | string): NormalizedPaymentEvent;

  refund(
    externalReference: string,
    amount: number,
    currency: string,
  ): Promise<RefundResult>;
}
