import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class LocationInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ default: 'AZ' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @ApiProperty({ example: 40.3777 })
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 49.892 })
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ default: 'Asia/Baku' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  openingHours?: Record<string, unknown>;

  /** UUID of the nearest Baku Metro station (from metro_stations table). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  nearestMetroStationId?: string;
}
