import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSiteSettingsDto {
  @IsObject()
  settings: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
