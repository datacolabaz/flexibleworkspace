import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { FavoriteEntity } from './entities/favorite.entity';
import { RoomEntity } from '../rooms/entities/room.entity';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';
import { StorageProvider } from '../storage/storage-provider.interface';
import { STORAGE_PROVIDER } from '../storage/storage.module';

export interface FavoriteRoomSummary {
  id: string;
  name: string;
  city: string;
  district: string | null;
  pricePerHour: { amount: number; currency: string };
  averageRating: number;
  reviewCount: number;
  coverPhotoUrl: string | null;
  favoritedAt: Date;
}

/** 09_DOMAIN_MODEL.md §9.2 "Favorite" — a simple save-for-later join table; no moderation, no business rules beyond "the room must exist." */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FavoriteEntity)
    private readonly favoriteRepo: Repository<FavoriteEntity>,
    @InjectRepository(RoomEntity)
    private readonly roomRepo: Repository<RoomEntity>,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  /**
   * Was hand-derived from `storage.localPath` here (e.g. `./uploads` ->
   * `/uploads/<key>`) — broken for TWO reasons: it never prefixed the
   * backend's public origin (same bug `SearchService` had), and it
   * assumed local-disk storage entirely, so it produced a dead URL for
   * any photo stored on S3/R2. Delegates to the injected StorageProvider,
   * the one place per driver that knows the right shape.
   */
  private storageKeyToUrl(storageKey: string): string {
    return this.storageProvider.publicUrlFor(storageKey);
  }

  async add(userId: string, roomId: string): Promise<{ favorited: true }> {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room || room.deletedAt) throw new ResourceNotFoundException('Room');

    const existing = await this.favoriteRepo.findOne({
      where: { userId, roomId },
    });
    if (!existing) {
      await this.favoriteRepo.save(
        this.favoriteRepo.create({ userId, roomId, createdAt: new Date() }),
      );
    }
    return { favorited: true };
  }

  async remove(userId: string, roomId: string): Promise<{ favorited: false }> {
    await this.favoriteRepo.delete({ userId, roomId });
    return { favorited: false };
  }

  async isFavorite(userId: string, roomId: string): Promise<boolean> {
    const existing = await this.favoriteRepo.findOne({
      where: { userId, roomId },
    });
    return !!existing;
  }

  /** "My favorites" list — room summary cards, same shape as SearchService's results, ordered most-recently-favorited first. */
  async listForUser(userId: string): Promise<FavoriteRoomSummary[]> {
    const rows = await this.dataSource.query(
      `SELECT
         r.id, r.name, l.city, l.district,
         r.base_price_amount::int AS price_amount, r.base_price_currency AS price_currency,
         r.average_rating::float AS average_rating, r.review_count,
         (
           SELECT storage_key FROM photo ph
           WHERE ph.room_id = r.id AND ph.moderation_status = 'APPROVED'
           ORDER BY ph.is_cover DESC, ph.display_order ASC
           LIMIT 1
         ) AS cover_photo_key,
         f.created_at AS favorited_at
       FROM favorite f
       JOIN room r ON r.id = f.room_id AND r.deleted_at IS NULL
       JOIN location l ON l.id = r.location_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [userId],
    );
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      city: row.city,
      district: row.district,
      pricePerHour: { amount: row.price_amount, currency: row.price_currency },
      averageRating: row.average_rating,
      reviewCount: row.review_count,
      coverPhotoUrl: row.cover_photo_key
        ? this.storageKeyToUrl(row.cover_photo_key)
        : null,
      favoritedAt: row.favorited_at,
    }));
  }
}
