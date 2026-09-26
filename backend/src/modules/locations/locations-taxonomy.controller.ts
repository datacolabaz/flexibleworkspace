import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Public } from '../../common/decorators/public.decorator';
import { LocationCategoryEntity } from './entities/location-category.entity';
import { MetroStationEntity } from './entities/metro-station.entity';

/**
 * Public reference-data endpoints for location taxonomy (P2 slice).
 * Both are read-only, seeded via migrations, and require no auth —
 * `GET /location-categories` is used during provider registration (the
 * user is authenticated as a regular user, not yet a provider) and
 * `GET /metro-stations` is used in the provider onboarding location form
 * and search filters.
 */
@ApiTags('Taxonomy')
@Controller()
export class LocationsTaxonomyController {
  constructor(
    @InjectRepository(LocationCategoryEntity)
    private readonly categoryRepo: Repository<LocationCategoryEntity>,
    @InjectRepository(MetroStationEntity)
    private readonly metroRepo: Repository<MetroStationEntity>,
  ) {}

  @Public()
  @Get('location-categories')
  @ApiOperation({ summary: 'List active provider location categories' })
  async listCategories() {
    return this.categoryRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  @Public()
  @Get('metro-stations')
  @ApiOperation({ summary: 'List Baku Metro stations (active only by default)' })
  async listMetroStations() {
    return this.metroRepo.find({
      where: { isActive: true },
      order: { line: 'ASC', nameAz: 'ASC' },
    });
  }
}
