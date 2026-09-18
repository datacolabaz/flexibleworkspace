import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RoleName } from '../../../common/constants/roles.enum';
import { AppUserEntity } from './app-user.entity';

@Entity({ name: 'user_role' })
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => AppUserEntity, (user) => user.roles)
  @JoinColumn({ name: 'user_id' })
  user: AppUserEntity;

  @Column({ type: 'enum', enum: RoleName })
  role: RoleName;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId: string | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
