import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'referral_reward' })
export class ReferralRewardEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'commission_ledger_id', type: 'uuid', nullable: true })
  commissionLedgerId: string | null;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ name: 'rule_id', type: 'uuid', nullable: true })
  ruleId: string | null;

  @Column({ name: 'recipient_type', type: 'varchar', length: 20 })
  recipientType: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId: string;

  @Column({ name: 'reward_amount_minor', type: 'int', default: 0 })
  rewardAmountMinor: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'eligible_at', type: 'timestamptz', nullable: true })
  eligibleAt: Date | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
