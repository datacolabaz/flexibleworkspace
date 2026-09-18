import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { UserRoleEntity } from './user-role.entity';

/**
 * Maps to the `app_user` table exactly as fixed in 28_DATABASE_DDL.sql.
 * Entity fields mirror DDL columns 1:1 — this file describes the existing
 * schema for query-building, it does not define/generate it (27_ADRS.md
 * ADR-009: TypeORM synchronize is disabled; migrations are the source of truth).
 */
@Entity({ name: 'app_user' })
export class AppUserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'citext', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 5, default: 'az' })
  locale: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  displayName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => UserRoleEntity, (role) => role.user)
  roles: UserRoleEntity[];
}
