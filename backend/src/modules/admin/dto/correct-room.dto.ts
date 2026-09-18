import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { RoomStatus } from '../../../common/constants/provider.enum';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.5's worked example ("Listing
 * shows the wrong capacity — admin corrects it") — deliberately a NARROW
 * allowlist of single-value fields, not the full owner-facing RoomInputDto
 * (which also touches locationId/roomTypeId/amenities). §33.1 Q2's "safe
 * correction, not unrestricted DB access" principle: an admin can fix an
 * obviously-wrong value, not silently reshape a listing's structure.
 */
export class CorrectRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacityMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacityMax?: number;

  @ApiPropertyOptional({ description: 'Minor units (qəpik)' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  basePriceAmount?: number;

  @ApiPropertyOptional({ enum: RoomStatus })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(3)
  reason: string;
}
