import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EventEntity } from './event.entity';
import { EventTicketTypeEntity } from './event-ticket-type.entity';

export enum EventTicketStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  USED = 'used',
}

/** Maps to the `event_tickets` table (EventTickets migration). */
@Entity({ name: 'event_tickets' })
export class EventTicketEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_type_id', type: 'uuid' })
  ticketTypeId: string;

  @ManyToOne(() => EventTicketTypeEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ticket_type_id' })
  ticketType: EventTicketTypeEntity;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'event_id' })
  event: EventEntity;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** External payment reference (e.g. Epoint/Payriff order ID) */
  @Column({ name: 'order_id', type: 'varchar', length: 100, nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 20, default: EventTicketStatus.PENDING })
  status: string;

  /** Unique hex token used to generate the QR code image */
  @Column({ name: 'qr_code', type: 'varchar', length: 255, nullable: true, unique: true })
  qrCode: string | null;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  @Column({ name: 'checked_in_by', type: 'uuid', nullable: true })
  checkedInBy: string | null;

  @Column({ name: 'amount_paid', type: 'decimal', precision: 10, scale: 2, default: 0 })
  amountPaid: number;

  @Column({ type: 'varchar', length: 3, default: 'AZN' })
  currency: string;

  @Column({ name: 'buyer_name', type: 'varchar', length: 200, nullable: true })
  buyerName: string | null;

  @Column({ name: 'buyer_email', type: 'varchar', length: 255, nullable: true })
  buyerEmail: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
