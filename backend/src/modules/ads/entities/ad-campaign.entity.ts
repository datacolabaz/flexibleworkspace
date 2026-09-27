import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdPlacementEntity } from './ad-placement.entity';
import { AdEventEntity } from './ad-event.entity';

@Entity({ name: 'ad_campaign' })
export class AdCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'placement_id', type: 'uuid' })
  placementId: string;

  @ManyToOne(() => AdPlacementEntity, (placement) => placement.campaigns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'placement_id' })
  placement: AdPlacementEntity;

  @Column({ type: 'boolean', default: false })
  active: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'advertiser_name', type: 'varchar', length: 160 })
  advertiserName: string;

  @Column({ name: 'creative_url', type: 'text' })
  creativeUrl: string;

  @Column({ name: 'click_url', type: 'text' })
  clickUrl: string;

  @Column({ type: 'int', default: 1 })
  weight: number;

  @Column({
    name: 'creative_size',
    type: 'varchar',
    length: 16,
    default: '336x280',
  })
  creativeSize: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => AdEventEntity, (event) => event.campaign)
  events: AdEventEntity[];
}
