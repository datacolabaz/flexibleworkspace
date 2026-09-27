import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdCampaignEntity } from './ad-campaign.entity';

@Entity({ name: 'ad_event' })
export class AdEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @ManyToOne(() => AdCampaignEntity, (campaign) => campaign.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign: AdCampaignEntity;

  @Column({ name: 'event_type', type: 'varchar', length: 20 })
  eventType: string;

  @Column({
    name: 'client_event_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  clientEventId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
