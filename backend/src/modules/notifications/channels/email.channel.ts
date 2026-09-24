import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  NotificationChannel,
  NotificationSendResult,
} from './notification-channel.interface';

/**
 * Real email channel (17_NOTIFICATION_ARCHITECTURE.md §17.2 — "mandatory,
 * built V1, cheapest channel by a wide margin").
 *
 * Two delivery paths, chosen at construction time by whether
 * RESEND_API_KEY is set:
 *
 * - Resend's HTTPS API (api.resend.com) — the default in any environment
 *   with RESEND_API_KEY set (staging/production). 2026-09-24 staging
 *   incident: raw SMTP sockets (ports 587/465/25) were found to be
 *   silently dropped outbound on Railway — the TCP connection never
 *   resolves and never errors, so requestOtp() (which awaits the send)
 *   hung forever on every OTP request. Resend's API runs over plain
 *   HTTPS (443), the same port everything else already uses, so it isn't
 *   subject to that block.
 * - nodemailer/SMTP — the fallback when RESEND_API_KEY is unset. Works
 *   against a local dev catcher (Mailhog/Mailpit on port 1025) or any
 *   real SMTP server, unchanged from before this incident.
 *
 * Either path: errors are caught by send() and logged, not thrown,
 * matching NotificationsService's "never block a booking confirmation on
 * a failed send" rule (17_NOTIFICATION_ARCHITECTURE.md §17.5).
 */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly channelType = 'EMAIL' as const;
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly resendApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.get<string>('smtp.from')!;
    this.resendApiKey = this.configService.get<string>('resend.apiKey') || '';
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
      // logged, not thrown (see class doc above).
    });
  }

  async send(
    recipient: string,
    subject: string | null,
    body: string,
  ): Promise<NotificationSendResult> {
    if (this.resendApiKey) {
      return this.sendViaResend(recipient, subject, body);
    }
    return this.sendViaSmtp(recipient, subject, body);
  }

  private async sendViaResend(
    recipient: string,
    subject: string | null,
    body: string,
  ): Promise<NotificationSendResult> {
    const requestPayload = {
      from: this.fromAddress,
      to: recipient,
      subject: subject ?? 'FlexSpace',
      html: body,
    };
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });
      const rawBody = await res.text();
      let payload: { id?: string; message?: string; name?: string } | null =
        null;
      try {
        payload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        payload = null;
      }
      // Temporary, deliberately verbose diagnostic log — Resend's sandbox
      // domain (onboarding@resend.dev) silently restricts delivery to only
      // the account owner's own verified address until a custom domain is
      // verified, so a 2xx response here does NOT guarantee the recipient
      // actually receives anything. Logging the exact request/response lets
      // us see that restriction (or any other cause) directly, rather than
      // guessing. `html` is deliberately omitted from the logged request —
      // it carries the live OTP code, which shouldn't sit in plaintext logs.
      this.logger.warn(
        `Resend API call for ${recipient} — request: ${JSON.stringify({
          from: requestPayload.from,
          to: requestPayload.to,
          subject: requestPayload.subject,
          html: `[${body.length} chars, omitted]`,
        })} | response status: ${res.status} | response body: ${rawBody}`,
      );
      if (!res.ok) {
        // Most common cause here: `from` (smtp.from / SMTP_FROM) is on a
        // domain not yet verified in Resend. Either verify the domain in
        // Resend's dashboard, or set SMTP_FROM to an address on Resend's
        // shared sandbox domain (e.g. "Spotva <onboarding@resend.dev>")
        // while that's pending.
        throw new Error(
          payload?.message || `Resend API responded ${res.status}`,
        );
      }
      return { success: true, providerMessageId: payload?.id };
    } catch (err) {
      this.logger.warn(
        `Resend email send failed to ${recipient}: ${(err as Error).message}`,
      );
      return { success: false, errorMessage: (err as Error).message };
    }
  }

  private async sendViaSmtp(
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
