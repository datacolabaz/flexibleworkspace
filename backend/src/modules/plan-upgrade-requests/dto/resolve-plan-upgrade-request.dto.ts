import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProviderPlanTier } from '../../../common/constants/provider.enum';

export class ResolvePlanUpgradeRequestDto {
  @ApiPropertyOptional({
    enum: ProviderPlanTier,
    description:
      'If set, also grants the provider this plan tier atomically with resolving the request. Omit to resolve without changing their plan (e.g. handled another way, or declined).',
  })
  @IsOptional()
  @IsEnum(ProviderPlanTier)
  grantPlanTier?: ProviderPlanTier;
}
