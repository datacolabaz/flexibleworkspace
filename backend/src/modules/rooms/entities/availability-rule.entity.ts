import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum RecurrenceType {
  WEEKLY = 'WEEKLY',
  DATE_SPECIFIC = 'DATE_SPECIFIC',
}

/** Maps to `availability_rule` (28_DATABASE_DDL.sql §4). */
@Entity({ name: 'availability_rule' })
export class AvailabilityRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({
    name: 'recurrence_type',
    type: 'enum',
    enum: RecurrenceType,
    default: RecurrenceType.WEEKLY,
  })
  recurrenceType: RecurrenceType;

  /** 0=Sunday..6=Saturday, used when recurrenceType = WEEKLY. */
  @Column({ name: 'day_of_week', type: 'smallint', nullable: true })
  dayOfWeek: number | null;

  /** Used when recurrenceType = DATE_SPECIFIC (an exception/override). */
  @Column({ name: 'specific_date', type: 'date', nullable: true })
  specificDate: string | null;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ name: 'is_open', type: 'boolean', default: true })
  isOpen: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
