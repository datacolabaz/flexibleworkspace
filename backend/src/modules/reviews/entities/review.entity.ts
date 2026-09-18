import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ModerationStatus } from '../../rooms/entities/photo.entity';

/**
 * Maps to `review` (28_DATABASE_DDL.sql §8, 09_DOMAIN_MODEL.md §9.2
 * "Review"). `bookingId` is UNIQUE — one review per completed booking.
 * `moderationStatus` defaults APPROVED at the DB level (reviews are public
 * immediately; moderation is reactive to a provider flag or an admin
 * investigation, not a pre-publish gate — 18_SECURITY.md §18.6).
 */
@Entity({ name: 'review' })
export class ReviewEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid', unique: true })
  bookingId: string;

  @Column({ name: 'customer_user_id', type: 'uuid' })
  customerUserId: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'jsonb', nullable: true })
  photos: string[] | null;

  @Column({ name: 'provider_reply_text', type: 'text', nullable: true })
  providerReplyText: string | null;

  @Column({ name: 'provider_reply_at', type: 'timestamptz', nullable: true })
  providerReplyAt: Date | null;

  @Column({
    name: 'moderation_status',
    type: 'enum',
    enum: ModerationStatus,
    default: ModerationStatus.APPROVED,
  })
  moderationStatus: ModerationStatus;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
