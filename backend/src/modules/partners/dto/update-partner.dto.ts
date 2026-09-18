import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PartnerType } from '../../../common/constants/partner.enum';
import { PartnerCommissionType } from '../../../common/constants/payment.enum';

/** Narrow, explicit allowlist (mirrors AdminUpdateUserDto/CorrectRoomDto's discipline elsewhere in the admin surface) — status changes go through ChangePartnerStatusDto instead, never through this endpoint. */
export class UpdatePartnerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: PartnerType })
  @IsOptional()
  @IsEnum(PartnerType)
  type?: PartnerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @ApiPropertyOptional({ enum: PartnerCommissionType })
  @IsOptional()
  @IsEnum(PartnerCommissionType)
  defaultCommissionType?: PartnerCommissionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultCommissionValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  bankAccountDetails?: Record<string, unknown>;

  @IsString()
  @MinLength(3)
  reason: string;
}
