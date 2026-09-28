import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AdInquiryStatus } from '../../../common/constants/ad-inquiry.enum';

/**
 * A prospective advertiser's public `/advertise` submission — see the
 * 1700000000038-AdInquiries migration's own comment for why this exists.
 * Unlike `LeadEntity` (which is scoped to one room/provider), this has no
 * ownership: only admins (AdminAdsController) can see or act on it.
 */
@Entity({ name: 'ad_inquiry' })
export class AdInquiryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255 })
  contactName: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 50 })
  contactPhone: string;

  @Column({
    name: 'contact_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  contactEmail: string | null;

  @Column({
    name: 'company_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  companyName: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({
    type: 'enum',
    enum: AdInquiryStatus,
    default: AdInquiryStatus.NEW,
  })
  status: AdInquiryStatus;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'contacted_at', type: 'timestamptz', nullable: true })
  contactedAt: Date | null;

  @Column({ name: 'contacted_by_user_id', type: 'uuid', nullable: true })
  contactedByUserId: string | null;
}
