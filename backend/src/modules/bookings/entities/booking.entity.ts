import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BookingStatus } from '../../../common/constants/booking.enum';
import { BookingItemEntity } from './booking-item.entity';

/** Maps to `booking` (28_DATABASE_DDL.sql §5). */
@Entity({ name: 'booking' })
export class BookingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_user_id', type: 'uuid' })
  customerUserId: string;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.DRAFT })
  status: BookingStatus;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({ name: 'gross_amount', type: 'bigint' })
  grossAmount: string;

  @Column({ name: 'service_fee_amount', type: 'bigint', default: 0 })
  serviceFeeAmount: string;

  @Column({ name: 'total_amount', type: 'bigint' })
  totalAmount: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  purpose: string | null;

  @Column({ name: 'participants_count', type: 'int', nullable: true })
  participantsCount: number | null;

  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true })
  holdExpiresAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => BookingItemEntity, (item) => item.booking, { cascade: true })
  items: BookingItemEntity[];
}
