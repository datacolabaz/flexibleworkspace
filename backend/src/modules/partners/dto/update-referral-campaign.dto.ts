import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ReferralCampaignStatus } from '../../../common/constants/partner.enum';
import { PartnerCommissionType } from '../../../common/constants/payment.enum';

/** Deliberately does NOT allow changing `code` once created — a live tracking link that silently pointed somewhere else would break every already-shared instance of it. Create a new campaign instead. */
export class UpdateReferralCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: ReferralCampaignStatus })
  @IsOptional()
  @IsEnum(ReferralCampaignStatus)
  status?: ReferralCampaignStatus;

  @ApiPropertyOptional({ enum: PartnerCommissionType })
  @IsOptional()
  @IsEnum(PartnerCommissionType)
  commissionTypeOverride?: PartnerCommissionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  commissionValueOverride?: number;

  @ApiPropertyOptional()
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
