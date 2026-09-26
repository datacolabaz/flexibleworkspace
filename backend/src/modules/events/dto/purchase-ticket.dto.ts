import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class PurchaseTicketDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  buyerName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  buyerEmail?: string;
}
