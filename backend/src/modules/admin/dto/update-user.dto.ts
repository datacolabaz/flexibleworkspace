import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.1 Q2 — "narrow allowlist
 * enforced in service layer" for SUPPORT_ADMIN's user.update permission.
 * Deliberately excludes email/phone/password (identity/credential fields
 * stay customer-self-service or a dedicated higher-trust flow, never a
 * plain admin PATCH) — only display fields an admin plausibly needs to
 * correct on a support call (a typo'd display name, locale mismatch).
 */
export class AdminUpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5)
  locale?: string;

  @IsString()
  @MinLength(3)
  reason: string;
}
