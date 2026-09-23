import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PlanUpgradeRequestStatus } from '../../../common/constants/plan-upgrade-request.enum';

/**
 * A provider asking to move to a higher plan (Pro today; ENTERPRISE is a
 * plan tier the entitlement code already knows about, so this isn't
 * hard-coded to Pro specifically) — see the 1700000000015 migration's own
 * comment for why this exists instead of a live self-serve checkout.
 */
@Entity({ name: 'plan_upgrade_request' })
export class PlanUpgradeRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({
    type: 'enum',
    enum: PlanUpgradeRequestStatus,
    default: PlanUpgradeRequestStatus.PENDING,
  })
  status: PlanUpgradeRequestStatus;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null;
}
