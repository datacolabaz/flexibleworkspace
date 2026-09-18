import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationSendResult,
} from './notification-channel.interface';

/**
 * REQUIRES USER ACTION — NOT PRODUCTION READY.
 *
 * 17_NOTIFICATION_ARCHITECTURE.md §17.6 flags that a local Azerbaijan SMS
 * aggregator must be sourced and its pricing verified before launch — no
 * vendor was available at Phase 4 implementation time (see PHASE4_REPORT.md).
 *
 * This class implements the same NotificationChannel interface every real
 * SMS vendor adapter would (so swapping in Twilio/Vonage/a local aggregator
 * later is a new class + config change, never a change to calling code —
 * exactly the adapter pattern used for payments in 13_PAYMENT_ARCHITECTURE.md),
 * but it does NOT send a real SMS. It logs the message server-side so OTP
 * login and booking-confirmation flows remain fully testable end-to-end in
 * development without a paid SMS vendor, and it fails loudly (rather than
 * silently pretending success) if used in production so nobody mistakes
 * this for a working channel.
 */
@Injectable()
export class SmsChannel implements NotificationChannel {
  readonly channelType = 'SMS' as const;
  private readonly logger = new Logger(SmsChannel.name);

  async send(
    recipient: string,
    _subject: string | null,
    body: string,
  ): Promise<NotificationSendResult> {
    if (process.env.NODE_ENV === 'production') {
      this.logger.error(
        `SMS channel is not configured with a real vendor (REQUIRES USER ACTION — 17_NOTIFICATION_ARCHITECTURE.md §17.6). Refusing to silently "succeed" for ${recipient} in production.`,
      );
      return { success: false, errorMessage: 'SMS_VENDOR_NOT_CONFIGURED' };
    }

    // Development/test only: make the OTP/notification visible in server logs.
    this.logger.log(`[DEV SMS to ${recipient}] ${body}`);
    return { success: true, providerMessageId: 'dev-console' };
  }
}
