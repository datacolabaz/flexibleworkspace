import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Read-mostly reference table, seeded by SeedReferenceData1700000000001. */
@Entity({ name: 'amenity' })
export class AmenityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'translation_key', type: 'varchar', length: 100 })
  translationKey: string;

  @Column({ name: 'icon_key', type: 'varchar', length: 100, nullable: true })
  iconKey: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  category: string | null;
}
