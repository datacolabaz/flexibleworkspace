import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProviderDto {
  @ApiProperty({ example: 'ABC Workspace MMC' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName: string;

  @ApiProperty({ example: 'ABC Workspace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiPropertyOptional({ example: 'coworking' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}
