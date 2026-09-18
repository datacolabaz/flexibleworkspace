import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { FavoritesService } from './favorites.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';

@ApiTags('Favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('me')
  @ApiOperation({ summary: 'My favorited rooms' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.favoritesService.listForUser(user.userId);
  }

  @Get(':roomId')
  @ApiOperation({ summary: 'Whether I have favorited this room' })
  async check(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return {
      favorited: await this.favoritesService.isFavorite(user.userId, roomId),
    };
  }

  @Post(':roomId')
  @ApiOperation({ summary: 'Favorite a room' })
  async add(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.favoritesService.add(user.userId, roomId);
  }

  @Delete(':roomId')
  @ApiOperation({ summary: 'Unfavorite a room' })
  async remove(
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.favoritesService.remove(user.userId, roomId);
  }
}
