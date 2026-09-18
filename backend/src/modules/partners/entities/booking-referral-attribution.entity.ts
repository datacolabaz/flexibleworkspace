import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Maps to `booking_referral_attribution` (32_PARTNER_REFERRAL_DDL.sql).
 * §31.2: one attribution per booking (DB-enforced via
 * `uq_booking_referral_attribution_booking`), written server-side at
 * booking-creation time only after the presented cookie's token was
 * verified against a real, unexpired `ReferralClick` row — never from a
 * client-asserted "referred by X" field.
 */
@Entity({ name: 'booking_referral_attribution' })
export class BookingReferralAttributionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'referral_click_id', type: 'uuid' })
  referralClickId: string;

  @Column({ name: 'partner_id', type: 'uuid' })
  partnerId: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @Column({ name: 'attributed_at', type: 'timestamptz' })
  attributedAt: Date;
}
