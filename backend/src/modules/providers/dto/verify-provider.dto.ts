import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProviderVerificationStatus } from '../../../common/constants/provider.enum';

export class VerifyProviderDto {
  @ApiProperty({
    enum: [
      ProviderVerificationStatus.VERIFIED,
      ProviderVerificationStatus.REJECTED,
    ],
  })
  @IsEnum(ProviderVerificationStatus)
  decision:
    ProviderVerificationStatus.VERIFIED | ProviderVerificationStatus.REJECTED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
