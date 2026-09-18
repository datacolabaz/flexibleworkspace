import { IsString, MinLength } from 'class-validator';

/** 18_SECURITY.md §18.6 — "reviews can be flagged by providers for admin review... without giving providers unilateral delete power." Flagging only records the report for admin attention (ReviewsService.flag); it never itself changes moderation_status. */
export class FlagReviewDto {
  @IsString()
  @MinLength(3)
  reason: string;
}
