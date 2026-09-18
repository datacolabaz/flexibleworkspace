import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

/**
 * 12_RESERVATION_ENGINE.md §12.4 — "a lightweight scheduled job, not a
 * dedicated streaming system." Runs every minute; each run is idempotent
 * (only acts on bookings whose hold has actually expired).
 */
@Injectable()
export class BookingsTasks {
  private readonly logger = new Logger(BookingsTasks.name);

  constructor(private readonly bookingsService: BookingsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleHoldExpirySweep(): Promise<void> {
    try {
      await this.bookingsService.expireStaleHolds();
    } catch (err) {
      this.logger.error(
        `Hold-expiry sweep failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
