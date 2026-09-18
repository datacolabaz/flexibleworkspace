import { IsString, MinLength } from 'class-validator';

/** 14_PAYOUT_LEDGER.md §14.5 step 3 — "marks the Payout PROCESSING -> PAID with a reference number." */
export class MarkPaidDto {
  @IsString()
  @MinLength(2)
  bankReference: string;
}
