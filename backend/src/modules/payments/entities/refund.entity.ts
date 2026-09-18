import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { RefundStatus } from '../../../common/constants/payment.enum';

/** Maps to `refund` (28_DATABASE_DDL.sql §6). */
@Entity({ name: 'refund' })
export class RefundEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'payment_transaction_id', type: 'uuid', nullable: true })
  paymentTransactionId: string | null;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.REQUESTED })
  status: RefundStatus;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
