import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'reward_rule' })
export class RewardRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'recipient_type', type: 'varchar', length: 20 })
  recipientType: string;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  rate: string;

  @Column({ name: 'max_reward_minor', type: 'int', nullable: true })
  maxRewardMinor: number | null;

  @Column({ name: 'funded_by', type: 'varchar', length: 20 })
  fundedBy: string;

  @Column({ name: 'attribution_source_type', type: 'varchar', length: 30, nullable: true })
  attributionSourceType: string | null;

  /** Must remain false in MVP — no automatic rewards. */
  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
