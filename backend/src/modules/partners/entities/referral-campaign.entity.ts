import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ReferralCampaignStatus } from '../../../common/constants/partner.enum';
import { PartnerCommissionType } from '../../../common/constants/payment.enum';

/**
 * Maps to `referral_campaign` (32_PARTNER_REFERRAL_DDL.sql). §31.2: a
 * partner can run multiple campaigns (different codes for different
 * videos/posts/channels) without needing multiple Partner records.
 */
@Entity({ name: 'referral_campaign' })
export class ReferralCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'partner_id', type: 'uuid' })
  partnerId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** Unique, human-facing — e.g. "BLOGGER123". Used verbatim in the public `/r/{code}` path. */
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({
    type: 'enum',
    enum: ReferralCampaignStatus,
    default: ReferralCampaignStatus.ACTIVE,
  })
  status: ReferralCampaignStatus;

  @Column({
    name: 'commission_type_override',
    type: 'enum',
    enum: PartnerCommissionType,
    nullable: true,
  })
  commissionTypeOverride: PartnerCommissionType | null;

  @Column({ name: 'commission_value_override', type: 'bigint', nullable: true })
  commissionValueOverride: string | null;

  @Column({ name: 'attribution_window_days', type: 'int', default: 30 })
  attributionWindowDays: number;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
