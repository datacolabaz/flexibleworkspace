import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Maps to `favorite` (28_DATABASE_DDL.sql §8, 09_DOMAIN_MODEL.md §9.2 "Favorite") — a plain join table, composite PK (user_id, room_id). */
@Entity({ name: 'favorite' })
export class FavoriteEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'room_id', type: 'uuid' })
  roomId: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
