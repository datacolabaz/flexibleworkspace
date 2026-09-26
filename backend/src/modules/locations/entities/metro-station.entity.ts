import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Maps to `metro_stations` — the seeded reference table for Baku Metro
 * stations (P2 slice). Query-only; writes go through migrations.
 */
@Entity({ name: 'metro_stations' })
export class MetroStationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name_az', type: 'varchar', length: 255 })
  nameAz: string;

  @Column({ name: 'name_en', type: 'varchar', length: 255 })
  nameEn: string;

  /** 1 = Red line, 2 = Green line */
  @Column({ type: 'smallint' })
  line: number;

  @Column({ name: 'line_color', type: 'varchar', length: 30 })
  lineColor: string;

  @Column({ type: 'float8', nullable: true })
  latitude: number | null;

  @Column({ type: 'float8', nullable: true })
  longitude: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
