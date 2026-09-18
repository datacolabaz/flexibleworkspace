import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

/** 14_PAYOUT_LEDGER.md §14.5 step 1. periodStart/periodEnd are descriptive metadata stamped on the created Payout rows (shown on the provider statement, §14.5 step 4) — eligibility itself is state-driven (booking status / cancellation window), not time-window-driven, so omitting these just labels the batch with a sensible default window. */
export class RunPayoutBatchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  periodEnd?: string;
}
