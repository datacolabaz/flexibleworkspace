/**
 * 17_NOTIFICATION_ARCHITECTURE.md §17.1 — every channel implements this same
 * shape so NotificationsService never depends on a concrete provider (email
 * vendor, SMS aggregator, ...). Swapping a vendor is a new class + config
 * change, never a change to calling code.
 */
export interface NotificationSendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface NotificationChannel {
  readonly channelType: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
  send(
    recipient: string,
    subject: string | null,
    body: string,
  ): Promise<NotificationSendResult>;
}
