import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PriceType, PriceUnitType } from '../../../common/constants/pricing.enum';

export class UpsertPricePackageDto {
  @ApiProperty({ enum: PriceUnitType })
  @IsEnum(PriceUnitType)
  unitType: PriceUnitType;

  @ApiPropertyOptional({ description: 'Minor units (qəpik). Omit for REQUEST.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount?: number | null;

  @ApiPropertyOptional({ default: 'AZN' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minDuration?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxDuration?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  validFrom?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  validUntil?: string | null;

  @ApiProperty({ enum: PriceType })
  @IsEnum(PriceType)
  priceType: PriceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class ReplacePricePackagesDto {
  @ApiProperty({ type: [UpsertPricePackageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertPricePackageDto)
  packages: UpsertPricePackageDto[];
}
