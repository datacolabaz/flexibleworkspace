import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLeadDto {
  @ApiProperty({ example: 'Aysel Məmmədova' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  customerName: string;

  @ApiProperty({ example: '+994501234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  customerPhone: string;

  @ApiPropertyOptional({ example: 'aysel@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  customerEmail?: string;

  @ApiPropertyOptional({ example: 'Sabah saat 14:00 üçün maraqlanıram.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
