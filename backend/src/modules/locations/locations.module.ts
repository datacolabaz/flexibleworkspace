import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationsController } from './locations.controller';
import { LocationsTaxonomyController } from './locations-taxonomy.controller';
import { LocationsService } from './locations.service';
import { LocationEntity } from './entities/location.entity';
import { LocationCategoryEntity } from './entities/location-category.entity';
import { MetroStationEntity } from './entities/metro-station.entity';
import { ProvidersModule } from '../providers/providers.module';

@Module({
  imports: [
    // LocationsService itself never injects a Repository<LocationEntity> —
    // every touch of this entity goes through raw SQL because of the
    // PostGIS `geo` column (see the comment on LocationEntity). But
    // ProviderEntity declares a @OneToMany relation to LocationEntity, and
    // TypeORM needs that entity's metadata registered somewhere in the
    // module tree to resolve the relation at boot, or it fails with
    // "Entity metadata for ProviderEntity#locations was not found." This
    // forFeature() call exists purely to register that metadata.
    TypeOrmModule.forFeature([LocationEntity, LocationCategoryEntity, MetroStationEntity]),
    ProvidersModule,
  ],
  controllers: [LocationsController, LocationsTaxonomyController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
