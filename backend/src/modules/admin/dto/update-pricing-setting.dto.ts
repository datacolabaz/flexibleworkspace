import { IsNumber, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdatePricingSettingDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentage: number;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  minimumPriceAmount: number;

  @IsString()
  @MinLength(3)
  reason: string;
}
