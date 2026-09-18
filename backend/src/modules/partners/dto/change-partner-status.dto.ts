import { IsEnum, IsString, MinLength } from 'class-validator';
import { PartnerStatus } from '../../../common/constants/partner.enum';

/** Gated by `partner.approve` (§33.4) — the trust-gating action, separate from ordinary field edits (`partner.update`). */
export class ChangePartnerStatusDto {
  @IsEnum(PartnerStatus)
  status: PartnerStatus;

  @IsString()
  @MinLength(3)
  reason: string;
}
