import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /**
   * @deprecated — single-category string kept for backwards compatibility.
   * Prefer `categories` (string array of slugs from location_categories table).
   */
  @ApiPropertyOptional({ example: 'coworking' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /** One or more category slugs from the `location_categories` reference table. */
  @ApiPropertyOptional({ example: ['coworking', 'icas-otagi'], isArray: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];
}
