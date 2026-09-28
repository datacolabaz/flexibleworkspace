import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AdInquiryStatus } from '../../../common/constants/ad-inquiry.enum';

export class CreateAdInquiryDto {
  @ApiProperty({ example: 'Aysel Məmmədova' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  contactName: string;

  @ApiProperty({ example: '+994501234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  contactPhone: string;

  @ApiPropertyOptional({ example: 'aysel@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'Mentorix.io' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @ApiPropertyOptional({
    example:
      'Category sponsor inventarına maraqlıyıq, 336x280 kreativimiz hazırdır.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}

export class UpdateAdInquiryStatusDto {
  @ApiProperty({ enum: AdInquiryStatus })
  @IsEnum(AdInquiryStatus)
  status: AdInquiryStatus;
}
