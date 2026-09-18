import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BookingStatus } from '../../../common/constants/booking.enum';
import { BookingEntity } from './booking.entity';

/**
 * Maps to `booking_item` (28_DATABASE_DDL.sql §5), the table carrying the
 * `no_overlapping_bookings` EXCLUDE USING gist constraint — the single most
 * safety-critical line in the entire schema (10_DATABASE_SCHEMA.md §10.4).
 * `status` mirrors the parent Booking's status on every transition; this
 * denormalization exists ONLY so the exclusion constraint's WHERE clause can
 * see it without a join, and BookingsService is the sole writer that keeps
 * the two in lockstep — no other code should update booking_item.status.
 */
@Entity({ name: 'booking_item' })
export class BookingItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @ManyToOne(() => BookingEntity, (booking) => booking.items)
  @JoinColumn({ name: 'booking_id' })
  booking: BookingEntity;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ name: 'unit_price_amount', type: 'bigint' })
  unitPriceAmount: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.DRAFT })
  status: BookingStatus;
}
