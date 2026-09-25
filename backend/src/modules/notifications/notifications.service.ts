import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationEntity,
  NotificationChannelType,
} from './entities/notification.entity';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 17_NOTIFICATION_ARCHITECTURE.md §17.1 — resolves which channel(s) handle a
 * given event, records a Notification row regardless of outcome (so support
 * can answer "did the user actually get this"), and NEVER throws on a
 * delivery failure — a failed send is logged and recorded, not allowed to
 * fail the business operation that triggered it (§17.5).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    private readonly emailChannel: EmailChannel,
    private readonly smsChannel: SmsChannel,
  ) {}

  static isEmail(identifier: string): boolean {
    return EMAIL_REGEX.test(identifier);
  }

  /**
   * userId is required because `notification.user_id` is NOT NULL in the
   * Phase 2 schema (28_DATABASE_DDL.sql) — every notification is tied to an
   * account. This is why AuthService creates (or finds) the AppUser record
   * at OTP-REQUEST time rather than only at verification: it mirrors
   * 05_USER_FLOWS.md §5.2's "account created automatically when needed"
   * principle rather than requiring a separate unauthenticated notification
   * concept the approved domain model doesn't have.
   */
  async sendOtp(
    userId: string,
    identifier: string,
    code: string,
    locale = 'az',
  ): Promise<void> {
    const isEmail = NotificationsService.isEmail(identifier);
    const subject = isEmail ? 'Spotva — Giriş kodunuz' : null;
    const body = isEmail
      ? `<p>Spotva giriş kodunuz: <b style="font-size:20px;letter-spacing:2px">${code}</b></p><p>Bu kod 5 dəqiqə ərzində etibarlıdır.</p>`
      : `Spotva giris kodunuz: ${code}. 5 deqiqe etibarlidir.`;

    await this.dispatch(
      userId,
      isEmail ? 'EMAIL' : 'SMS',
      'auth.otp',
      locale,
      { identifier },
      async () => {
        const channel = isEmail ? this.emailChannel : this.smsChannel;
        return channel.send(identifier, subject, body);
      },
    );
  }

  /**
   * Generic entry point for domain-triggered notifications (booking
   * confirmed, provider new-booking alert, etc. — 17_NOTIFICATION_ARCHITECTURE.md
   * §17.3 event/channel matrix). Modules call this rather than touching a
   * channel directly.
   */
  async send(params: {
    userId: string;
    channel: NotificationChannelType;
    templateKey: string;
    locale: string;
    recipient: string;
    subject: string | null;
    body: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.dispatch(
      params.userId,
      params.channel,
      params.templateKey,
      params.locale,
      params.payload ?? {},
      async () => {
        const channel =
          params.channel === 'EMAIL' ? this.emailChannel : this.smsChannel;
        return channel.send(params.recipient, params.subject, params.body);
      },
    );
  }

  private async dispatch(
    userId: string,
    channel: NotificationChannelType,
    templateKey: string,
    locale: string,
    payload: Record<string, unknown>,
    sendFn: () => Promise<{ success: boolean; errorMessage?: string }>,
  ): Promise<void> {
    const record = this.notificationRepo.create({
      userId,
      channel,
      templateKey,
      locale,
      status: 'QUEUED',
      payload,
      createdAt: new Date(),
    });
    const saved = await this.notificationRepo.save(record);

    try {
      const result = await sendFn();
      saved.status = result.success ? 'SENT' : 'FAILED';
      saved.sentAt = result.success ? new Date() : null;
      await this.notificationRepo.save(saved);
      if (!result.success) {
        this.logger.warn(
          `Notification ${saved.id} (${templateKey}) failed: ${result.errorMessage}`,
        );
      }
    } catch (err) {
      saved.status = 'FAILED';
      await this.notificationRepo.save(saved);
      this.logger.warn(
        `Notification ${saved.id} (${templateKey}) threw: ${(err as Error).message}`,
      );
    }
  }
}
