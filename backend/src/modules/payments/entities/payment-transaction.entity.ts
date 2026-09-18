import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  PaymentTransactionStatus,
  PaymentTransactionType,
} from '../../../common/constants/payment.enum';
import { PaymentEntity } from './payment.entity';

/**
 * Maps to `payment_transaction` (28_DATABASE_DDL.sql §6). `external_reference`
 * carries the UNIQUE constraint that makes webhook processing idempotent
 * (10_DATABASE_SCHEMA.md §10.7, 18_SECURITY.md §18.3) — a duplicate webhook
 * delivery for the same gateway event hits this unique constraint rather
 * than double-processing.
 */
@Entity({ name: 'payment_transaction' })
export class PaymentTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @ManyToOne(() => PaymentEntity, (p) => p.transactions)
  @JoinColumn({ name: 'payment_id' })
  payment: PaymentEntity;

  @Column({ type: 'enum', enum: PaymentTransactionType })
  type: PaymentTransactionType;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'char', length: 3, default: 'AZN' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.INITIATED,
  })
  status: PaymentTransactionStatus;

  @Column({
    name: 'gateway_response_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  gatewayResponseCode: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 255 })
  externalReference: string;

  @Column({ name: 'webhook_received_at', type: 'timestamptz', nullable: true })
  webhookReceivedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
