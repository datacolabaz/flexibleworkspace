import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RecordAnalyticsEventDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  event!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ts?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventId?: string;
}
