import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Maps to `audit_log` as extended by 34_ADMIN_AUDIT_DDL.sql (ADR-011):
 * append-only (no UPDATE/DELETE grant at the application role level, ever —
 * 18_SECURITY.md §18.5), now carrying `reason` and `reverted_audit_log_id`.
 */
@Entity({ name: 'audit_log' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  beforeState: Record<string, unknown> | null;

  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  afterState: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'reverted_audit_log_id', type: 'uuid', nullable: true })
  revertedAuditLogId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
