import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoomStatus } from '../../../common/constants/provider.enum';
import { LocationEntity } from '../../locations/entities/location.entity';
import { RoomTypeEntity } from './room-type.entity';
import { AmenityEntity } from './amenity.entity';

/**
 * Maps to the `room` table (28_DATABASE_DDL.sql §4). `search_tsv` is
 * intentionally NOT mapped — it's a trigger-populated generated column
 * (16_SEARCH_ARCHITECTURE.md), never written by application code.
 */
@Entity({ name: 'room' })
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @ManyToOne(() => LocationEntity)
  @JoinColumn({ name: 'location_id' })
  location: LocationEntity;

  @Column({ name: 'room_type_id', type: 'uuid' })
  roomTypeId: string;

  @ManyToOne(() => RoomTypeEntity)
  @JoinColumn({ name: 'room_type_id' })
  roomType: RoomTypeEntity;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'capacity_min', type: 'int', default: 1 })
  capacityMin: number;

  @Column({ name: 'capacity_max', type: 'int' })
  capacityMax: number;

  @Column({
    name: 'size_sqm',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  sizeSqm: string | null;

  @Column({ name: 'min_booking_minutes', type: 'int', default: 30 })
  minBookingMinutes: number;

  @Column({ name: 'max_booking_minutes', type: 'int', default: 480 })
  maxBookingMinutes: number;

  @Column({ name: 'advance_booking_min_hours', type: 'int', default: 1 })
  advanceBookingMinHours: number;

  @Column({ name: 'advance_booking_max_days', type: 'int', default: 90 })
  advanceBookingMaxDays: number;

  @Column({ name: 'buffer_minutes', type: 'int', default: 0 })
  bufferMinutes: number;

  @Column({ name: 'base_price_amount', type: 'bigint' })
  basePriceAmount: string;

  @Column({
    name: 'base_price_currency',
    type: 'char',
    length: 3,
    default: 'AZN',
  })
  basePriceCurrency: string;

  @Column({ name: 'cancellation_policy', type: 'jsonb', nullable: true })
  cancellationPolicy: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: RoomStatus, default: RoomStatus.DRAFT })
  status: RoomStatus;

  @Column({
    name: 'average_rating',
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0,
  })
  averageRating: string;

  @Column({ name: 'review_count', type: 'int', default: 0 })
  reviewCount: number;

  @Column({
    name: 'video_storage_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  videoStorageKey: string | null;

  @Column({ name: 'video_duration_seconds', type: 'int', nullable: true })
  videoDurationSeconds: number | null;

  @Column({ name: 'video_size_bytes', type: 'bigint', nullable: true })
  videoSizeBytes: string | null;

  @Column({
    name: 'video_mime_type',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  videoMimeType: string | null;

  // Sprint 4 (Featured Listing) — admin-only on/off flag, no expiry.
  // Toggled from the admin panel's Listings section
  // (AdminListingsService.setFeatured); read by SearchService's public
  // `GET spaces/featured` for the homepage's "Featured venues" section.
  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;

  @ManyToMany(() => AmenityEntity)
  @JoinTable({
    name: 'room_amenity',
    joinColumn: { name: 'room_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'amenity_id', referencedColumnName: 'id' },
  })
  amenities: AmenityEntity[];

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
