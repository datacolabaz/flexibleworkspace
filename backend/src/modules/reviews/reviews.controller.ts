import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { FlagReviewDto } from './dto/flag-review.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES, RoleName } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';
import { ModerationStatus } from '../rooms/entities/photo.entity';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  private requireProviderId(user: AuthenticatedUser): string {
    const providerId = currentProviderId(user);
    if (!providerId)
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    return providerId;
  }

  @Public()
  @Get('spaces/:roomId/reviews')
  @ApiOperation({ summary: 'Public reviews for a room (APPROVED only)' })
  async listForRoom(@Param('roomId') roomId: string) {
    return this.reviewsService.listForRoom(roomId);
  }

  @Post('reviews')
  // 18_SECURITY.md §18.6 — "review creation is rate-limited per account to
  // prevent rapid-fire review farming even across multiple legitimately-
  // completed bookings." Same throttling mechanism as AuthController's OTP endpoints.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Review a completed booking (one review per booking, §18.6 fake-review prevention)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.userId, dto);
  }

  @Get('reviews/me')
  @ApiOperation({
    summary:
      'My own submitted reviews (any moderation status — see /account/reviews)',
  })
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.reviewsService.listForCustomer(user.userId);
  }

  @Patch('reviews/:id/reply')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({
    summary: 'Provider replies to a review on one of their own rooms',
  })
  async reply(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewsService.reply(
      id,
      this.requireProviderId(user),
      dto.text,
    );
  }

  @Post('reviews/:id/flag')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({
    summary:
      'Flag a review for admin re-review (does not itself hide it, §18.6)',
  })
  async flag(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FlagReviewDto,
  ) {
    await this.reviewsService.flag(
      id,
      this.requireProviderId(user),
      user.userId,
      dto.reason,
    );
    return { flagged: true };
  }

  @Get('admin/reviews')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.REVIEW_MODERATE)
  @ApiOperation({
    summary:
      'Admin review list — flagged queue by default, or all/filtered by moderation status',
  })
  async listForAdmin(
    @Query('flagged') flagged?: string,
    @Query('moderationStatus') moderationStatus?: ModerationStatus,
  ) {
    if (flagged === 'true') return this.reviewsService.listFlaggedForAdmin();
    return this.reviewsService.listForAdmin(moderationStatus);
  }

  @Patch('admin/reviews/:id/moderate')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.REVIEW_MODERATE)
  @ApiOperation({
    summary:
      'Approve or reject a review (18_SECURITY.md §18.6) — recomputes the room rating aggregate',
  })
  async moderate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviewsService.moderate(
      id,
      user.userId,
      dto.decision,
      dto.reason,
    );
  }
}
