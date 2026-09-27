import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AdCampaignEntity } from './ad-campaign.entity';

@Entity({ name: 'ad_placement' })
export class AdPlacementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ name: 'rotation_interval_seconds', type: 'int', default: 45 })
  rotationIntervalSeconds: number;

  @OneToMany(() => AdCampaignEntity, (campaign) => campaign.placement)
  campaigns: AdCampaignEntity[];
}
