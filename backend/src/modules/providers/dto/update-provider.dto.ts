import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Self-service profile edits (PATCH providers/me). Deliberately narrow —
 * `verificationStatus`, `commissionPercentage` and `planTier` are admin-
 * controlled only (ProvidersService.verify/setSuspended), never editable
 * by the provider themselves.
 *
 * `taxId` (VÖEN) has no setter anywhere else — `CreateProviderDto` never
 * collected it, despite `ProviderEntity.taxId` existing since the base
 * schema — so self-registration always leaves it null until the provider
 * fills it in here, which they'll want to do as part of submitting
 * verification documents (Sprint 1, 25_PROVIDER_ARCHITECTURE.md).
 */
export class UpdateProviderDto {
  @ApiPropertyOptional({ example: 'AZ1234567' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxId?: string;
}
