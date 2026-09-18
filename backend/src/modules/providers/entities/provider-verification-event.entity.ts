import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ProviderVerificationStatus } from '../../../common/constants/provider.enum';

/**
 * Append-only history — 09_DOMAIN_MODEL.md §9.2: "why was this provider
 * rejected then re-verified is always answerable." Never updated/deleted.
 */
@Entity({ name: 'provider_verification_event' })
export class ProviderVerificationEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ type: 'enum', enum: ProviderVerificationStatus })
  status: ProviderVerificationStatus;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
