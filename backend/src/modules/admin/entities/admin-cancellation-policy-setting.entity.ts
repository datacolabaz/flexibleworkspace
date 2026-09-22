import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'admin_cancellation_policy_setting' })
export class AdminCancellationPolicySettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'setting_key', type: 'varchar', length: 80, unique: true })
  settingKey: string;

  @Column({ name: 'free_until_hours', type: 'numeric', precision: 6, scale: 2 })
  freeUntilHours: string;

  @Column({
    name: 'partial_refund_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  partialRefundPct: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
