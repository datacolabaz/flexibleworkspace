import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  NotificationChannel,
  NotificationSendResult,
} from './notification-channel.interface';

/**
 * Real SMTP-based email channel (17_NOTIFICATION_ARCHITECTURE.md §17.2 —
 * "mandatory, built V1, cheapest channel by a wide margin"). Works against
 * ANY SMTP server: a local dev catcher (Mailhog/Mailpit on port 1025), or a
 * real provider (Amazon SES / Resend SMTP endpoints per 23_COST_MODEL.md)
 * in production — swapping is purely an .env change.
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly channelType = 'EMAIL' as const;
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.get<string>('smtp.from')!;
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('smtp.host'),
      port: this.configService.get<number>('smtp.port'),
      secure: this.configService.get<boolean>('smtp.secure'),
      auth: this.configService.get<string>('smtp.user')
        ? {
            user: this.configService.get<string>('smtp.user'),
            pass: this.configService.get<string>('smtp.password'),
          }
        : undefined,
      // In development, no SMTP server may be running at all (e.g. no local
      // Mailhog started) — we don't want that to crash OTP/booking flows
      // during local dev/testing. Errors are caught by send() below and
      // logged, not thrown, matching NotificationsService's "never block a
      // booking confirmation on a failed send" rule (17_NOTIFICATION_ARCHITECTURE.md §17.5).
    });
  }

  async send(
    recipient: string,
    subject: string | null,
    body: string,
  ): Promise<NotificationSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: recipient,
        subject: subject ?? 'FlexSpace',
        html: body,
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      this.logger.warn(
        `Email send failed to ${recipient}: ${(err as Error).message}`,
      );
      return { success: false, errorMessage: (err as Error).message };
    }
  }
}
