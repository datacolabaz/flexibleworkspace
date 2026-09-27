import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { PriceType, PriceUnitType } from '../../../common/constants/pricing.enum';

@Entity({ name: 'room_price_package' })
export class RoomPricePackageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'unit_type', type: 'varchar', length: 32 })
  unitType: PriceUnitType;

  @Column({ type: 'bigint', nullable: true })
  amount: string | null;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({ name: 'min_duration', type: 'int', nullable: true })
  minDuration: number | null;

  @Column({ name: 'max_duration', type: 'int', nullable: true })
  maxDuration: number | null;

  @Column({ name: 'billing_unit', type: 'varchar', length: 32 })
  billingUnit: PriceUnitType;

  @Column({ name: 'tax_included', type: 'boolean', default: true })
  taxIncluded: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'valid_from', type: 'timestamptz', nullable: true })
  validFrom: Date | null;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'last_updated_at', type: 'timestamptz' })
  lastUpdatedAt: Date;

  @Column({ name: 'price_type', type: 'varchar', length: 32 })
  priceType: PriceType;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
