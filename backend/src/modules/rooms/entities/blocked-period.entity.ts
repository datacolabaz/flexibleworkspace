import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to `blocked_period` (28_DATABASE_DDL.sql §4). */
@Entity({ name: 'blocked_period' })
export class BlockedPeriodEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
