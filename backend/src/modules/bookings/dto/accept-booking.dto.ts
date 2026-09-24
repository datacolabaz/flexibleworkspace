import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * T4 — PATCH provider/bookings/:bookingId/accept. `providerNote` is
 * notification-only (passed to the customer's confirmation notification);
 * it is not persisted on the booking row.
 */
export class AcceptBookingDto {
  @ApiPropertyOptional({
    description:
      'Optional note shown to the customer in the acceptance notification.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  providerNote?: string;
}
