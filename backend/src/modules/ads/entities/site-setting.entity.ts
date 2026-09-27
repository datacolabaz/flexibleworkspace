import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'site_setting' })
export class SiteSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'text', default: '' })
  value: string;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
