import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type NotificationChannelType = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';
export type NotificationStatusType = 'QUEUED' | 'SENT' | 'FAILED';

/** Maps to `notification` table (28_DATABASE_DDL.sql). */
@Entity({ name: 'notification' })
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH'] })
  channel: NotificationChannelType;

  @Column({ name: 'template_key', type: 'varchar', length: 100 })
  templateKey: string;

  @Column({ type: 'varchar', length: 5 })
  locale: string;

  @Column({
    type: 'enum',
    enum: ['QUEUED', 'SENT', 'FAILED'],
    default: 'QUEUED',
  })
  status: NotificationStatusType;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;
}
