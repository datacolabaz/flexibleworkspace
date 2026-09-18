import { IsString, MinLength } from 'class-validator';

/** Shared by mark-failed / reverse — both are high-risk financial state changes and, per every other admin financial action in this codebase (RefundsService.approve, VerifyProviderDto), require an explicit reason for the audit trail (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.6/§9). */
export class PayoutReasonDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
