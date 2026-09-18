import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';
import { RecurrenceType } from '../entities/availability-rule.entity';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export class AvailabilityRuleInputDto {
  @ApiProperty({ enum: RecurrenceType, default: RecurrenceType.WEEKLY })
  @IsEnum(RecurrenceType)
  recurrenceType: RecurrenceType;

  @ApiPropertyOptional({
    description: '0=Sunday..6=Saturday, required when recurrenceType=WEEKLY',
  })
  @ValidateIf((o) => o.recurrenceType === RecurrenceType.WEEKLY)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ApiPropertyOptional({
    description: 'Required when recurrenceType=DATE_SPECIFIC',
  })
  @ValidateIf((o) => o.recurrenceType === RecurrenceType.DATE_SPECIFIC)
  @IsDateString()
  specificDate?: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm' })
  startTime: string;

  @ApiProperty({ example: '21:00' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm' })
  endTime: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

/** PUT /provider/rooms/{roomId}/availability-rules replaces the full rule set. */
export class ReplaceAvailabilityRulesDto {
  @ApiProperty({ type: [AvailabilityRuleInputDto] })
  rules: AvailabilityRuleInputDto[];
}
