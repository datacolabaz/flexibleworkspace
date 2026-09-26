import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTicketTypeDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  /** null = unlimited */
  @IsInt()
  @Min(1)
  @Max(100000)
  @IsOptional()
  quantityTotal?: number | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  saleStartsAt?: string;

  @IsString()
  @IsOptional()
  saleEndsAt?: string;
}
