import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { EventLocationEntity } from './event-location.entity';
import { EventRsvpEntity } from './event-rsvp.entity';

export enum EventFormat {
  WORKSHOP = 'workshop',
  TELIM = 'telim',
  SEMINAR = 'seminar',
  GORUSME = 'gorusme',
  NETWORKING = 'networking',
  PANEL = 'panel',
  PODKAST = 'podkast',
  FOTO_VIDEO = 'foto_video',
  DIGER = 'diger',
}

export enum EventVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum EventStatus {
  DRAFT = 'draft',
  VENUE_PENDING = 'venue_pending',
  PUBLISHED = 'published',
  RSVP_OPEN = 'rsvp_open',
  SOLD_OUT = 'sold_out',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived',
}

/** Maps to the `events` table (P3 Events migration). */
@Entity({ name: 'events' })
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organizer_id', type: 'uuid' })
  organizerId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 300, unique: true })
  slug: string;

  @Column({ type: 'enum', enum: EventFormat, default: EventFormat.DIGER })
  format: EventFormat;

  @Column({ name: 'short_description', type: 'varchar', length: 500, default: '' })
  shortDescription: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ name: 'cover_image', type: 'varchar', length: 500, nullable: true })
  coverImage: string | null;

  @Column({ type: 'varchar', length: 10, default: 'az' })
  language: string;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  @Column({ type: 'enum', enum: EventVisibility, default: EventVisibility.PUBLIC })
  visibility: EventVisibility;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.DRAFT })
  status: EventStatus;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'timestamptz' })
  endAt: Date;

  @Column({ name: 'rsvp_deadline', type: 'timestamptz', nullable: true })
  rsvpDeadline: Date | null;

  @Column({ name: 'doors_open_at', type: 'timestamptz', nullable: true })
  doorsOpenAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => EventLocationEntity, (el) => el.event, { cascade: true })
  eventLocations: EventLocationEntity[];

  @OneToMany(() => EventRsvpEntity, (rsvp) => rsvp.event, { cascade: true })
  rsvps: EventRsvpEntity[];

  /** Whether ticket sales are enabled for this event (default false — RSVP only). */
  @Column({ name: 'tickets_enabled', type: 'boolean', default: false })
  ticketsEnabled: boolean;

  /** Optional cap on total ticket sales (across all ticket types). */
  @Column({ name: 'max_attendees', type: 'int', nullable: true })
  maxAttendees: number | null;
}
