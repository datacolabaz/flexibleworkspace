import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import {
  PaymentAdapterName,
  PaymentStatus,
} from '../../../common/constants/payment.enum';
import { PaymentTransactionEntity } from './payment-transaction.entity';

/** Maps to `payment` (28_DATABASE_DDL.sql §6). One row per checkout attempt/session. */
@Entity({ name: 'payment' })
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({ name: 'provider_adapter', type: 'enum', enum: PaymentAdapterName })
  providerAdapter: PaymentAdapterName;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.INITIATED,
  })
  status: PaymentStatus;

  @Column({
    name: 'external_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  externalReference: string | null;

  @OneToMany(() => PaymentTransactionEntity, (t) => t.payment)
  transactions: PaymentTransactionEntity[];

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
