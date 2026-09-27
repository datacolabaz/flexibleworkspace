import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReferralLinkDto {
  @ApiPropertyOptional({ enum: ['location', 'event', 'homepage'] })
  @IsOptional()
  @IsString()
  destinationType?: 'location' | 'event' | 'homepage';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaign?: string;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  attributionWindowDays?: number;
}
