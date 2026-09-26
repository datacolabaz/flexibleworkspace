import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import {
  ProviderPlanTier,
  ProviderVerificationDocumentType,
  ProviderVerificationStatus,
} from '../../../common/constants/provider.enum';

/** One entry of the `provider.verification_documents` JSONB array. */
export interface ProviderVerificationDocument {
  type: ProviderVerificationDocumentType;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  uploadedAt: string;
}
import { LocationEntity } from '../../locations/entities/location.entity';

/**
 * Maps to the `provider` table exactly as fixed in 28_DATABASE_DDL.sql
 * §4 (base table created early as a forward-reference target, then
 * extended via ALTER TABLE — see the DDL comment). Entity describes the
 * existing schema for query-building only (27_ADRS.md ADR-009).
 */
@Entity({ name: 'provider' })
export class ProviderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 255 })
  legalName: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255 })
  displayName: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  /**
   * Multi-category support (P2 slice) — stores an array of slugs from
   * `location_categories`. Defaults to `[]`; the old `category` field is
   * preserved for backward compatibility.
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  categories: string[];

  @Column({ name: 'tax_id', type: 'varchar', length: 100, nullable: true })
  taxId: string | null;

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: ProviderVerificationStatus,
    default: ProviderVerificationStatus.PENDING,
  })
  verificationStatus: ProviderVerificationStatus;

  @Column({
    name: 'commission_percentage',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  commissionPercentage: string | null;

  @Column({
    name: 'plan_tier',
    type: 'enum',
    enum: ProviderPlanTier,
    default: ProviderPlanTier.FREE,
  })
  planTier: ProviderPlanTier;

  @Column({ name: 'bank_account_details', type: 'jsonb', nullable: true })
  bankAccountDetails: Record<string, unknown> | null;

  @Column({
    name: 'verification_documents',
    type: 'jsonb',
    default: () => "'[]'",
  })
  verificationDocuments: ProviderVerificationDocument[];

  /** Optional business logo/cover photo — set via `POST providers/:id/logo`, separate from room photos and from the private verification documents above. */
  @Column({
    name: 'logo_storage_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  logoStorageKey: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => LocationEntity, (location) => location.provider)
  locations: LocationEntity[];
}
