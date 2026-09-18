import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Maps to `referral_click` (32_PARTNER_REFERRAL_DDL.sql). §31.2/§31.4: the
 * authoritative, server-recorded proof that a tracking link was followed.
 * `attributionToken` is the ONLY value ever placed in the client cookie —
 * opaque and meaningless without this row, which is why the cookie alone is
 * never trusted as attribution proof (§31.4).
 */
@Entity({ name: 'referral_click' })
export class ReferralClickEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_id', type: 'uuid' })
  campaignId: string;

  @Column({ name: 'attribution_token', type: 'varchar', length: 128 })
  attributionToken: string;

  @Column({ name: 'ip_hash', type: 'varchar', length: 128, nullable: true })
  ipHash: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({
    name: 'landing_path',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  landingPath: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
