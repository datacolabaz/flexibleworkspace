import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { FavoriteEntity } from './entities/favorite.entity';
import { RoomEntity } from '../rooms/entities/room.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteEntity, RoomEntity])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
