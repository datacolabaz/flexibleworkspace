import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Same field allowlist AdminUpdateUserDto already uses for the admin-side
 * equivalent edit (admin/dto/update-user.dto.ts) — its own comment there
 * is explicit that email/phone stay out of any plain PATCH ("identity/
 * credential fields stay customer-self-service or a dedicated higher-trust
 * flow, never a plain admin PATCH"). For self-service too, changing an
 * OTP-login identifier needs its own re-verification flow (proving you
 * still control the new email/phone), which this pass doesn't build —
 * flagged in PHASE4_REPORT.md, not silently worked around. displayName/
 * locale carry no such risk, so they're the only fields exposed here.
 */
const SUPPORTED_LOCALES = ['az', 'en', 'ru', 'tr', 'es', 'de'] as const;

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Display name shown in the header and account area',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  @ApiPropertyOptional({
    description:
      "Preferred locale for notifications (NotificationsService) and future site visits. Must match frontend/lib/i18n/routing.ts's supported locale list.",
    enum: SUPPORTED_LOCALES,
  })
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_LOCALES)
  locale?: string;
}
