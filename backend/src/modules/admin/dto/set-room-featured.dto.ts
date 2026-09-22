import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * Sprint 4 (Featured Listing) — deliberately separate from
 * `CorrectRoomDto`: that DTO is the "fix wrong data, reason required,
 * revertible" primitive (§33.5); toggling Featured on/off is a routine
 * marketing action an admin may do often, so it doesn't force a reason.
 */
export class SetRoomFeaturedDto {
  @ApiProperty()
  @IsBoolean()
  isFeatured: boolean;
}
