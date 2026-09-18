import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ReviewEntity } from './entities/review.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { RoomEntity } from '../rooms/entities/room.entity';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { ModerationStatus } from '../rooms/entities/photo.entity';
import { BookingStatus } from '../../common/constants/booking.enum';
import { RoleName } from '../../common/constants/roles.enum';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DomainException,
  NotEligibleForReviewException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

/** Postgres unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * 09_DOMAIN_MODEL.md §9.2 "Review" + 18_SECURITY.md §18.6 (fake-review
 * prevention). Reviews are public/APPROVED by default (DB default) —
 * moderation is reactive (a provider flag or admin investigation), never a
 * pre-publish gate, and room.average_rating/review_count (consumed by
 * SearchService's relevance scoring, 16_SEARCH_ARCHITECTURE.md §16.3) are
 * recomputed from APPROVED reviews only, every time the APPROVED set can
 * have changed — on create and on every moderation decision.
 */
@Injectable()
export class ReviewsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ReviewEntity)
    private readonly reviewRepo: Repository<ReviewEntity>,
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async recomputeRoomRating(roomId: string): Promise<void> {
    const [row] = await this.dataSource.query(
      `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*)::int AS cnt
       FROM review WHERE room_id = $1 AND moderation_status = 'APPROVED'`,
      [roomId],
    );
    await this.dataSource.query(
      `UPDATE room SET average_rating = $1, review_count = $2 WHERE id = $3`,
      [Number(row.avg_rating).toFixed(2), row.cnt, roomId],
    );
  }

  /**
   * §18.6 structural constraint: "a review can only be created against a
   * Booking with status = COMPLETED belonging to the reviewing user" +
   * provider self-review prevention (cross-referencing the reviewer's role
   * assignments against the room's owning provider). Rate-limiting is
   * applied at the controller (@Throttle), not here — same split as
   * AuthController's OTP endpoints.
   */
  async create(
    customerUserId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewEntity> {
    const booking = await this.bookingRepo.findOne({
      where: { id: dto.bookingId },
    });
    if (!booking || booking.deletedAt)
      throw new ResourceNotFoundException('Booking');
    if (booking.customerUserId !== customerUserId)
      throw new ResourceNotFoundException('Booking');
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new NotEligibleForReviewException();
    }

    const [item] = await this.dataSource.query(
      `SELECT room_id FROM booking_item bi WHERE bi.booking_id = $1 LIMIT 1`,
      [booking.id],
    );
    if (!item) throw new ResourceNotFoundException('Booking item');
    const roomId = item.room_id;

    const [room] = await this.dataSource.query(
      `SELECT r.id, l.provider_id FROM room r JOIN location l ON l.id = r.location_id WHERE r.id = $1`,
      [roomId],
    );
    if (!room) throw new ResourceNotFoundException('Room');

    const [selfReview] = await this.dataSource.query(
      `SELECT 1 FROM user_role WHERE user_id = $1 AND provider_id = $2 AND role IN ($3, $4) LIMIT 1`,
      [
        customerUserId,
        room.provider_id,
        RoleName.PROVIDER_OWNER,
        RoleName.PROVIDER_STAFF,
      ],
    );
    if (selfReview) {
      throw new DomainException(
        'SELF_REVIEW_NOT_ALLOWED',
        'A provider account cannot review its own room.',
        HttpStatus.FORBIDDEN,
      );
    }

    let review = this.reviewRepo.create({
      bookingId: dto.bookingId,
      customerUserId,
      roomId,
      rating: dto.rating,
      text: dto.text ?? null,
      photos: dto.photos ?? null,
      moderationStatus: ModerationStatus.APPROVED,
      createdAt: new Date(),
    });
    try {
      review = await this.reviewRepo.save(review);
    } catch (err: any) {
      if (err?.code === PG_UNIQUE_VIOLATION) {
        throw new DomainException(
          'REVIEW_ALREADY_EXISTS',
          'This booking has already been reviewed.',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }

    await this.recomputeRoomRating(roomId);
    return review;
  }

  async listForRoom(roomId: string): Promise<ReviewEntity[]> {
    return this.reviewRepo.find({
      where: { roomId, moderationStatus: ModerationStatus.APPROVED },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * The reviewing customer's own submitted reviews — for `/account/reviews`.
   * Unlike `listForRoom` (public, APPROVED-only), this returns every
   * moderation status: a REJECTED review is still the customer's own
   * content and they're entitled to see what happened to it, the same way
   * `AccountService.getProfile` never filters a user's view of their own
   * data by an internal status flag.
   */
  async listForCustomer(customerUserId: string): Promise<ReviewEntity[]> {
    return this.reviewRepo.find({
      where: { customerUserId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Provider replying to a review on one of their own rooms. */
  async reply(
    reviewId: string,
    providerId: string,
    text: string,
  ): Promise<ReviewEntity> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new ResourceNotFoundException('Review');
    const [room] = await this.dataSource.query(
      `SELECT l.provider_id FROM room r JOIN location l ON l.id = r.location_id WHERE r.id = $1`,
      [review.roomId],
    );
    if (!room || room.provider_id !== providerId)
      throw new ResourceNotFoundException('Review');

    review.providerReplyText = text;
    review.providerReplyAt = new Date();
    return this.reviewRepo.save(review);
  }

  /**
   * §18.6 — flagging records the report for admin attention only; it never
   * itself hides the review (that would hand providers unilateral removal
   * power, which the doc explicitly rules out). AuditLogService is the one
   * place every admin-surfaced event is recorded (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md
   * §33.6), so a flag is just an audit entry an admin's moderation queue
   * can query for.
   */
  async flag(
    reviewId: string,
    providerId: string,
    flaggedByUserId: string,
    reason: string,
  ): Promise<void> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new ResourceNotFoundException('Review');
    const [room] = await this.dataSource.query(
      `SELECT l.provider_id FROM room r JOIN location l ON l.id = r.location_id WHERE r.id = $1`,
      [review.roomId],
    );
    if (!room || room.provider_id !== providerId)
      throw new ResourceNotFoundException('Review');

    await this.auditLogService.recordChange({
      actorUserId: flaggedByUserId,
      entityType: 'Review',
      entityId: review.id,
      action: 'FLAG',
      reason,
    });
  }

  /** Reviews with at least one un-resolved FLAG audit entry (no moderation decision recorded after it) — the admin moderation queue. */
  async listFlaggedForAdmin(): Promise<ReviewEntity[]> {
    const rows = await this.dataSource.query(`
      SELECT r.* FROM review r
      WHERE EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.entity_type = 'Review' AND al.entity_id = r.id AND al.action = 'FLAG'
          AND NOT EXISTS (
            SELECT 1 FROM audit_log al2
            WHERE al2.entity_type = 'Review' AND al2.entity_id = r.id AND al2.action = 'MODERATE'
              AND al2.created_at > al.created_at
          )
      )
      ORDER BY r.created_at DESC
    `);
    return rows;
  }

  async listForAdmin(
    moderationStatus?: ModerationStatus,
  ): Promise<ReviewEntity[]> {
    return this.reviewRepo.find({
      where: moderationStatus ? { moderationStatus } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  /** §18.6 moderation decision — the only thing that actually changes what's public. */
  async moderate(
    reviewId: string,
    adminUserId: string,
    decision: ModerationStatus.APPROVED | ModerationStatus.REJECTED,
    reason?: string,
  ): Promise<ReviewEntity> {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new ResourceNotFoundException('Review');

    const before = { moderationStatus: review.moderationStatus };
    review.moderationStatus = decision;
    const updated = await this.reviewRepo.save(review);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Review',
      entityId: review.id,
      action: 'MODERATE',
      beforeState: before,
      afterState: { moderationStatus: updated.moderationStatus },
      reason: reason ?? null,
    });

    await this.recomputeRoomRating(review.roomId);
    return updated;
  }
}
