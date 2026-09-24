import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { BookingRejectionReason } from '../../../common/constants/booking-rejection-reason.enum';

/**
 * T4 — PATCH provider/bookings/:bookingId/reject. `note` is required when
 * reason=OTHER (the closed enum has no catch-all text otherwise) and
 * optional for every other reason — same @ValidateIf-without-@IsOptional
 * conditional-required pattern as AvailabilityRuleInputDto in this codebase.
 */
export class RejectBookingDto {
  @ApiProperty({ enum: BookingRejectionReason })
  @IsEnum(BookingRejectionReason)
  reason: BookingRejectionReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @ValidateIf((o) => o.reason === BookingRejectionReason.OTHER)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
