import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Read-mostly taxonomy table, seeded by SeedReferenceData1700000000001. */
@Entity({ name: 'room_type' })
export class RoomTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'translation_key', type: 'varchar', length: 100 })
  translationKey: string;

  @Column({ name: 'parent_type_id', type: 'uuid', nullable: true })
  parentTypeId: string | null;

  @Column({ name: 'default_capacity_min', type: 'int', nullable: true })
  defaultCapacityMin: number | null;

  @Column({ name: 'default_capacity_max', type: 'int', nullable: true })
  defaultCapacityMax: number | null;

  @Column({
    name: 'search_facet_weight',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 1.0,
  })
  searchFacetWeight: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
