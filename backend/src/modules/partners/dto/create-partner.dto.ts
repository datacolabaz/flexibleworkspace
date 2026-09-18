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
} from 'class-validator';
import { PartnerType } from '../../../common/constants/partner.enum';
import { PartnerCommissionType } from '../../../common/constants/payment.enum';

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.7 — partners are admin-provisioned
 * only (no self-signup in V1), so this DTO backs `POST /admin/partners`
 * exclusively. A new partner always starts PENDING (entity default);
 * activating it is a separate, explicit `PARTNER_APPROVE`-gated action
 * (PartnersService.changeStatus), never implicit in creation.
 */
export class CreatePartnerDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(PartnerType)
  type: PartnerType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  contactPhone?: string;

  @IsEnum(PartnerCommissionType)
  defaultCommissionType: PartnerCommissionType;

  @ApiPropertyOptional({
    description:
      'Minor currency units if FIXED_PER_BOOKING, basis points (1/100%) if PERCENTAGE_OF_PLATFORM_FEE',
  })
  @IsInt()
  @Min(0)
  defaultCommissionValue: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  bankAccountDetails?: Record<string, unknown>;
}
