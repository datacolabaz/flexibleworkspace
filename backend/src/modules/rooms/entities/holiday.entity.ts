import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Shared reference calendar (12_RESERVATION_ENGINE.md §12.1), seeded data. */
@Entity({ name: 'holiday' })
export class HolidayEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode: string;

  @Column({ name: 'observed_date', type: 'date' })
  observedDate: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;
}
