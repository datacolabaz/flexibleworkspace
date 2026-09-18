import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { PartnerCommissionType } from '../../../common/constants/payment.enum';

/** §31.2 — `code` is unique platform-wide (`uq_referral_campaign_code`) and used verbatim in the public `/r/{code}` path, so it's restricted to URL-safe characters. */
export class CreateReferralCampaignDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may only contain letters, digits, underscores, and hyphens.',
  })
  code: string;

  @ApiPropertyOptional({
    enum: PartnerCommissionType,
    description: 'Overrides the partner default for this campaign only',
  })
  @IsOptional()
  @IsEnum(PartnerCommissionType)
  commissionTypeOverride?: PartnerCommissionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionValueOverride?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  attributionWindowDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
