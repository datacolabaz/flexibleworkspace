import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePlanUpgradeRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional free-text note from the provider (e.g. which plan, why, best time to reach them).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
