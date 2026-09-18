import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export type SearchSort = 'relevance' | 'price' | 'distance' | 'rating';

/**
 * Query params for `GET /spaces` (29_API_OPENAPI.yaml, 16_SEARCH_ARCHITECTURE.md
 * §16.2). All fields are optional except pagination, which defaults —
 * a bare `GET /spaces` is a valid "browse everything" search.
 */
export class SearchQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  /** Matches room_type.translation_key exactly (e.g. "room_type.meeting_room") — this is a fixed taxonomy, not free text (30_SEED_DATA.sql). */
  @IsOptional()
  @IsString()
  roomType?: string;

  /** ISO date (YYYY-MM-DD), interpreted in the room's own location timezone, as AvailabilityService does. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format.',
  })
  date?: string;

  /** 24h "HH:mm", local to the room's location timezone. Required alongside `date`+`durationMinutes` to run the live-availability filter. */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be in HH:mm 24h format.',
  })
  startTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  participants?: number;

  /** Minor units (qəpik), matching Money.amount throughout the API. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceMax?: number;

  /** Comma-separated amenity.translation_key values (style: form, explode: false, per the OpenAPI param). ALL requested amenities must be present (§16.2 point 1 — array containment, a hard filter). */
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsIn(['relevance', 'price', 'distance', 'rating'])
  sort?: SearchSort;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  radiusKm?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
