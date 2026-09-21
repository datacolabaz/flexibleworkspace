import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'visitor_event' })
export class VisitorEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type', type: 'varchar', length: 40 })
  eventType: string;

  @Column({ type: 'varchar', length: 500 })
  path: string;

  @Column({ name: 'visitor_hash', type: 'char', length: 64 })
  visitorHash: string;

  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
