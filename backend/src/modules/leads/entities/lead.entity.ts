import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { LeadStatus } from '../../../common/constants/lead.enum';

/**
 * A customer expressing interest in a room without booking/paying — see
 * the 1700000000011-Leads migration's own comment for why this exists.
 * `providerId` is denormalized directly onto the row (not derived via a
 * `room_id` join on every read) so the provider-facing inbox query
 * (LeadsService.listForProvider) is a plain indexed `WHERE provider_id =
 * $1`, the same denormalization discipline `ledger_entry.provider_id`
 * already uses for the same reason (PayoutsService).
 */
@Entity({ name: 'lead' })
export class LeadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 255 })
  customerName: string;

  @Column({ name: 'customer_phone', type: 'varchar', length: 50 })
  customerPhone: string;

  @Column({
    name: 'customer_email',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  customerEmail: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
  status: LeadStatus;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'contacted_at', type: 'timestamptz', nullable: true })
  contactedAt: Date | null;

  @Column({ name: 'contacted_by_user_id', type: 'uuid', nullable: true })
  contactedByUserId: string | null;
}
