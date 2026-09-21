import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'admin_pricing_setting' })
export class AdminPricingSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'setting_key', type: 'varchar', length: 80, unique: true })
  settingKey: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage: string | null;

  @Column({ name: 'minimum_price_amount', type: 'bigint', nullable: true })
  minimumPriceAmount: string | null;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
