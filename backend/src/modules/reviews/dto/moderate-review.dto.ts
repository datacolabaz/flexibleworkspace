import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ModerationStatus } from '../../rooms/entities/photo.entity';

export class ModerateReviewDto {
  @ApiProperty({ enum: [ModerationStatus.APPROVED, ModerationStatus.REJECTED] })
  @IsEnum(ModerationStatus)
  decision: ModerationStatus.APPROVED | ModerationStatus.REJECTED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
