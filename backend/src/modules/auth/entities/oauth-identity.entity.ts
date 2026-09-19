import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type OAuthProvider = 'GOOGLE' | 'FACEBOOK';

/**
 * Maps to the `oauth_identity` table added by
 * 1700000000005-OAuthIdentities.ts — see that migration for the schema
 * rationale (mechanism table, not domain model, same framing as
 * otp_code/refresh_token).
 */
@Entity({ name: 'oauth_identity' })
export class OAuthIdentityEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  provider: OAuthProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId: string;

  @Column({ type: 'citext', nullable: true })
  email: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
