import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Maps to `location_categories` — the seeded reference table for provider
 * venue categories (P2 slice). Query-only; writes go through migrations.
 */
@Entity({ name: 'location_categories' })
export class LocationCategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ name: 'name_az', type: 'varchar', length: 255 })
  nameAz: string;

  @Column({ name: 'name_en', type: 'varchar', length: 255 })
  nameEn: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
