import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to `analytics_event` (InitSchema + migration 031). BIGSERIAL PK kept. */
@Entity({ name: 'analytics_event' })
export class AnalyticsEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'event_name', type: 'varchar', length: 100 })
  eventName: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'organizer_id', type: 'uuid', nullable: true })
  organizerId: string | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @Column({ name: 'event_ref_id', type: 'uuid', nullable: true })
  eventRefId: string | null;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ name: 'source', type: 'varchar', length: 100, nullable: true })
  source: string | null;

  @Column({ name: 'medium', type: 'varchar', length: 100, nullable: true })
  medium: string | null;

  @Column({ name: 'campaign', type: 'varchar', length: 100, nullable: true })
  campaign: string | null;

  @Column({ name: 'referrer', type: 'varchar', length: 500, nullable: true })
  referrer: string | null;

  @Column({ name: 'landing_path', type: 'varchar', length: 500, nullable: true })
  landingPath: string | null;

  @Column({ name: 'value', type: 'numeric', precision: 10, scale: 2, nullable: true })
  value: string | null;

  @Column({ type: 'jsonb', nullable: true })
  properties: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'client_event_id', type: 'varchar', length: 64, nullable: true })
  clientEventId: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
