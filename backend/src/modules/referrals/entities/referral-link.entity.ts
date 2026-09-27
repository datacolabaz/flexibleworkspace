import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  ReferralLinkDestinationType,
  ReferralLinkOwnerType,
} from '../../../common/constants/attribution.enum';

@Entity({ name: 'referral_link' })
export class ReferralLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_type', type: 'varchar', length: 20 })
  ownerType: ReferralLinkOwnerType;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ name: 'destination_type', type: 'varchar', length: 20, nullable: true })
  destinationType: ReferralLinkDestinationType | null;

  @Column({ name: 'destination_id', type: 'uuid', nullable: true })
  destinationId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  campaign: string | null;

  @Column({ name: 'attribution_window_days', type: 'int', default: 7 })
  attributionWindowDays: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'click_count', type: 'int', default: 0 })
  clickCount: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
