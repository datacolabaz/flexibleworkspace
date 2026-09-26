import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EventEntity } from './event.entity';

/** Maps to the `event_ticket_types` table (EventTickets migration). */
@Entity({ name: 'event_ticket_types' })
export class EventTicketTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event: EventEntity;

  /** Display name, e.g. 'Free', 'Standard', 'VIP' */
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 0.00 = free */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'varchar', length: 3, default: 'AZN' })
  currency: string;

  /** NULL = unlimited */
  @Column({ name: 'quantity_total', type: 'int', nullable: true })
  quantityTotal: number | null;

  @Column({ name: 'quantity_sold', type: 'int', default: 0 })
  quantitySold: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sale_starts_at', type: 'timestamptz', nullable: true })
  saleStartsAt: Date | null;

  @Column({ name: 'sale_ends_at', type: 'timestamptz', nullable: true })
  saleEndsAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
