import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class LinkVenueDto {
  @IsUUID()
  @IsNotEmpty()
  locationId: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;
}
