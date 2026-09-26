import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum PromoDiscountType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

/**
 * Task 4 — Promo code entity.
 * Maps to the `promo_codes` table (migration 1700000000025).
 *
 * discount_value semantics:
 *   - PERCENT: basis points, e.g. 1500 = 15 %
 *   - FIXED:   minor units (qəpik), e.g. 500 = 5.00 AZN
 */
@Entity({ name: 'promo_codes' })
export class PromoCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ name: 'discount_type', type: 'enum', enum: PromoDiscountType })
  discountType: PromoDiscountType;

  @Column({ name: 'discount_value', type: 'int' })
  discountValue: number;

  @Column({ name: 'max_uses', type: 'int', nullable: true })
  maxUses: number | null;

  @Column({ name: 'uses_count', type: 'int', default: 0 })
  usesCount: number;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
