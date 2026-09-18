import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
  PartnerStatus,
  PartnerType,
} from '../../../common/constants/partner.enum';
import { PartnerCommissionType } from '../../../common/constants/payment.enum';

/**
 * Maps to `partner` (32_PARTNER_REFERRAL_DDL.sql, migration
 * 1700000000003-PartnerReferral.ts — already applied). 31_PARTNER_REFERRAL_
 * ARCHITECTURE.md §31.2. `ownerUserId` is a reserved, nullable
 * forward-compatibility column for a future self-service portal login — not
 * used anywhere in V1 (§31.7: no self-service partner portal).
 */
@Entity({ name: 'partner' })
export class PartnerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: PartnerType })
  type: PartnerType;

  @Column({ type: 'enum', enum: PartnerStatus, default: PartnerStatus.PENDING })
  status: PartnerStatus;

  @Column({ name: 'contact_email', type: 'citext', nullable: true })
  contactEmail: string | null;

  @Column({
    name: 'contact_phone',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  contactPhone: string | null;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({
    name: 'default_commission_type',
    type: 'enum',
    enum: PartnerCommissionType,
    default: PartnerCommissionType.PERCENTAGE_OF_PLATFORM_FEE,
  })
  defaultCommissionType: PartnerCommissionType;

  /** Minor currency units if FIXED_PER_BOOKING, basis points (1/100 of a percent) if PERCENTAGE_OF_PLATFORM_FEE — see CommissionService.buildPartnerCommissionEntry's storage-convention note. */
  @Column({ name: 'default_commission_value', type: 'bigint' })
  defaultCommissionValue: string;

  @Column({ name: 'bank_account_details', type: 'jsonb', nullable: true })
  bankAccountDetails: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
