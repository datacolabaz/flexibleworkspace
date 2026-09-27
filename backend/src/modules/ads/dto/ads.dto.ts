import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AD_CREATIVE_SIZES,
  AD_ROTATION_INTERVALS,
} from '../../../common/constants/ads.enum';

export class CreateAdCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  placementKey: string;

  @IsBoolean()
  active: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  advertiserName: string;

  @IsUrl({ require_tld: false })
  creativeUrl: string;

  @IsUrl({ require_tld: false })
  clickUrl: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weight: number;

  @IsIn(AD_CREATIVE_SIZES)
  creativeSize: (typeof AD_CREATIVE_SIZES)[number];
}

export class UpdateAdCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  placementKey?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  advertiserName?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  creativeUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  clickUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsIn(AD_CREATIVE_SIZES)
  creativeSize?: (typeof AD_CREATIVE_SIZES)[number];
}

export class UpdateAdPlacementDto {
  @Type(() => Number)
  @IsInt()
  @IsIn([...AD_ROTATION_INTERVALS])
  rotationIntervalSeconds: number;
}

export class RecordAdEventDto {
  @IsIn(['impression', 'click'])
  type: 'impression' | 'click';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  eventId?: string;
}
