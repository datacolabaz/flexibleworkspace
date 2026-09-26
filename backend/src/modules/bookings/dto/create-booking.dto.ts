import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class GuestCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

/** Mirrors the inline POST /bookings request body in 29_API_OPENAPI.yaml. */
export class CreateBookingDto {
  @ApiProperty()
  @IsUUID()
  roomId: string;

  @ApiProperty()
  @IsDateString()
  startAt: string;

  @ApiProperty()
  @IsDateString()
  endAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  participants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    description:
      'Required when the caller is not authenticated (guest checkout).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestCustomerDto)
  customer?: GuestCustomerDto;

  /** Task 4 — optional promo code; validated server-side, discount applied before final total. */
  @ApiPropertyOptional({ description: 'Promo/discount code (case-insensitive).' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  /** Task 4 — optional referral/UTM source tag for attribution tracking. */
  @ApiPropertyOptional({ description: 'UTM/attribution source tag, e.g. "instagram_story".' })
  @IsOptional()
  @IsString()
  referralSource?: string;
}
