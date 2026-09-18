import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.1's "adding a Podcast Studio
 * category without a deploy" worked example — the room_type/amenity
 * reference tables (28_DATABASE_DDL.sql §3) are already the mechanism for
 * this, they just had no write path until now (seed-only before this).
 */
export class CreateRoomTypeDto {
  @IsString()
  @MaxLength(100)
  translationKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCapacityMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultCapacityMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9.99)
  searchFacetWeight?: number;
}

export class UpdateRoomTypeDto extends CreateRoomTypeDto {}

export class CreateAmenityDto {
  @IsString()
  @MaxLength(100)
  translationKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  iconKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;
}

export class UpdateAmenityDto extends CreateAmenityDto {}
