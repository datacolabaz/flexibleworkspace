import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AttributionSourceType } from '../../../common/constants/attribution.enum';

@Entity({ name: 'booking_attribution' })
export class BookingAttributionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  @Column({
    name: 'source_type',
    type: 'varchar',
    length: 30,
    default: AttributionSourceType.UNKNOWN,
  })
  sourceType: AttributionSourceType;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ name: 'source_code', type: 'varchar', length: 100, nullable: true })
  sourceCode: string | null;

  @Column({ name: 'first_touch_source', type: 'jsonb', nullable: true })
  firstTouchSource: Record<string, unknown> | null;

  @Column({ name: 'last_touch_source', type: 'jsonb', nullable: true })
  lastTouchSource: Record<string, unknown> | null;

  @Column({ name: 'landing_path', type: 'varchar', length: 500, nullable: true })
  landingPath: string | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId: string | null;

  @Column({ name: 'organizer_id', type: 'uuid', nullable: true })
  organizerId: string | null;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @Column({ name: 'attribution_model', type: 'varchar', length: 30 })
  attributionModel: string;

  @Column({ name: 'attributed_at', type: 'timestamptz' })
  attributedAt: Date;

  @Column({ name: 'attribution_locked_at', type: 'timestamptz', nullable: true })
  attributionLockedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
