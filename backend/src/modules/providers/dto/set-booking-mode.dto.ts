import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * `PATCH providers/me/booking-mode` (2026-09-26 product decision).
 * Opt-in ONLY — PAYMENT_BASED (auto-confirm on payment capture) is every
 * provider's default; setting this true is the one thing that makes a NEW
 * booking on this provider's rooms go through the manual accept/reject
 * (REQUEST_BASED) flow instead. See ProviderEntity.requestBasedEnabled.
 */
export class SetBookingModeDto {
  @ApiProperty({
    description:
      'Opt in to REQUEST_BASED bookings (you manually accept/reject each new booking) instead of the PAYMENT_BASED default (payment capture auto-confirms).',
    example: false,
  })
  @IsBoolean()
  requestBasedEnabled: boolean;
}
