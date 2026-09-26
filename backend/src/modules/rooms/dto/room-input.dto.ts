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

  /** Task 1 — free-text usage rules shown to customers before booking (optional). */
  @ApiPropertyOptional({ description: 'Usage rules displayed to customers before booking.' })
  @IsOptional()
  @IsString()
  rules?: string;
}

/**
 * PATCH /provider/rooms/{roomId}/amenities — a narrow, amenities-only
 * sibling to the full-object RoomInputDto used by PATCH /:roomId.
 * Editing just the amenity checkboxes on an already-created room
 * shouldn't require resubmitting every other field (name, price,
 * capacity, …) — that full-object PATCH's own semantics (each omitted
 * optional field like sizeSqm/cancellationPolicy is reset to null, per
 * RoomsService.update()) would silently wipe them if a caller only meant
 * to change amenities.
 */
export class UpdateRoomAmenitiesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  amenityIds: string[];
}
