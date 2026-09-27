import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'referral_link_click' })
export class ReferralLinkClickEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referral_link_id', type: 'uuid' })
  referralLinkId: string;

  @Column({ name: 'attribution_token', type: 'varchar', length: 64 })
  attributionToken: string;

  @Column({ name: 'landing_path', type: 'varchar', length: 500, nullable: true })
  landingPath: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
