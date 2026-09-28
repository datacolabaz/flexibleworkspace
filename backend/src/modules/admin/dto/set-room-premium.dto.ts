import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';

/**
 * Category-scoped premium ranking (offline-paid, admin-only — see
 * 1700000000039-RoomPremium.ts). No `category`/`roomTypeId` field here:
 * premium is implicitly scoped to whatever category the room already
 * belongs to.
 *
 * Every field besides `isPremium` is optional and, when omitted, leaves
 * that column unchanged — so the admin can flip `isPremium` on/off
 * without resending priority/dates/note every time. To CLEAR a date,
 * send it as `null` explicitly (omitting it leaves the prior value).
 */
export class SetRoomPremiumDto {
  @ApiProperty()
  @IsBoolean()
  isPremium: boolean;

  @ApiPropertyOptional({
    description:
      'Lower = ranked higher among simultaneously-active premium rooms in the same category.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO 8601. null clears it.',
  })
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO 8601. null clears it.',
  })
  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Admin-only, never public.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  internalNote?: string | null;
}
