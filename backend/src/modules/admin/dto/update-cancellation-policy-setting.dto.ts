import { IsNumber, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateCancellationPolicySettingDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freeUntilHours: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  partialRefundPct: number;

  @IsString()
  @MinLength(3)
  reason: string;
}
