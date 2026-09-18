import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Mirrors RoomInput in 29_API_OPENAPI.yaml exactly — the OpenAPI contract is the source of truth (ADR-009). */
export class RoomInputDto {
  @ApiProperty()
  @IsUUID()
  locationId: string;

  @ApiProperty()
  @IsUUID()
  roomTypeId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacityMin?: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacityMax: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  sizeSqm?: number;

  @ApiProperty({ description: 'Minor units (qəpik)' })
  @IsInt()
  @IsPositive()
  basePriceAmount: number;

  @ApiPropertyOptional({ default: 'AZN' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  basePriceCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  amenityIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  cancellationPolicy?: Record<string, unknown>;
}
