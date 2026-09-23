import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ProviderVerificationDocumentType } from '../../../common/constants/provider.enum';

/**
 * One row per verification document ever accepted, keyed by the file's own
 * SHA-256 (content, not filename) — the only cross-provider index this
 * module needs. `verification_documents` on `provider` itself is a JSONB
 * array (1700000000009's "never filtered/joined across providers"
 * reasoning), which is exactly why THIS table exists: the one thing that
 * legitimately needs a query across every provider's documents is fraud
 * detection — the same physical ID/business-registration file reused to
 * spin up a second account and dodge the FREE-plan one-room limit (the
 * owner's explicit ask, 2026-09-23: "eyni istifadəçi ... eyni sənədlərlə
 * iki elan qoya bilməsin", generalized past VÖEN alone to any document
 * type — a driver's licence is still an ID_DOCUMENT upload, no new enum
 * value needed). A hash match under the SAME provider (re-uploading the
 * same file, e.g. correcting a mistaken document type) is normal and not
 * a violation; ProvidersService checks `providerId` before treating a
 * match as fraud, rather than relying on the DB unique index for that
 * business decision — the index is a race-safety net, not the primary
 * check.
 */
@Entity({ name: 'provider_document_hash' })
export class ProviderDocumentHashEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'file_hash', type: 'varchar', length: 64 })
  fileHash: string;

  // varchar, not a Postgres enum type — verification_documents' own type
  // field (1700000000009) was never promoted to a DB enum either, so this
  // stays consistent rather than introducing the only enum type in this
  // module.
  @Column({ name: 'document_type', type: 'varchar', length: 30 })
  documentType: ProviderVerificationDocumentType;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
