import { IsString, IsUUID, MinLength } from 'class-validator';

export class RequestRefundDto {
  @IsUUID()
  bookingId: string;

  @IsString()
  @MinLength(3)
  reason: string;
}
