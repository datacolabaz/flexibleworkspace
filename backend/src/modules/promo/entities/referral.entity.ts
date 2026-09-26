import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum ReferralStatus {
  PENDING = 'pending',
  QUALIFIED = 'qualified',
  REWARDED = 'rewarded',
}

/**
 * Task 4 — Referral tracking entity.
 * Maps to the `referrals` table (migration 1700000000025).
 *
 * A referral is created when a new user signs up via a referrer's link.
 * It becomes QUALIFIED once the referred user makes their first non-cancelled booking.
 * It becomes REWARDED once the referrer's reward has been disbursed.
 *
 * referred_user_id is UNIQUE — a user can only be referred once.
 */
@Entity({ name: 'referrals' })
export class ReferralEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referrer_user_id', type: 'uuid' })
  referrerUserId: string;

  @Column({ name: 'referred_user_id', type: 'uuid', unique: true })
  referredUserId: string;

  /** UTM-style source tag, e.g. 'instagram_story', 'email_campaign_q1'. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  source: string | null;

  @Column({ type: 'enum', enum: ReferralStatus, default: ReferralStatus.PENDING })
  status: ReferralStatus;

  /** Reward in minor units (qəpik). Set when status transitions to REWARDED. */
  @Column({ name: 'reward_amount', type: 'int', nullable: true })
  rewardAmount: number | null;

  /** The qualifying booking that triggered QUALIFIED status. */
  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
