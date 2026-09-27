import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { RoomEntity } from './entities/room.entity';
import { AmenityEntity } from './entities/amenity.entity';
import { RoomTypeEntity } from './entities/room-type.entity';
import { AvailabilityRuleEntity } from './entities/availability-rule.entity';
import { BlockedPeriodEntity } from './entities/blocked-period.entity';
import { PhotoEntity } from './entities/photo.entity';
import { LocationsModule } from '../locations/locations.module';
import { ProvidersModule } from '../providers/providers.module';
import { StorageModule } from '../storage/storage.module';
import { PricePackagesService } from './price-packages.service';
import { PriceQuoteService } from './price-quote.service';
import { RoomPricePackageEntity } from './entities/room-price-package.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoomEntity,
      AmenityEntity,
      RoomTypeEntity,
      AvailabilityRuleEntity,
      BlockedPeriodEntity,
      PhotoEntity,
      RoomPricePackageEntity,
    ]),
    LocationsModule,
    ProvidersModule,
    StorageModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService, PricePackagesService, PriceQuoteService],
  exports: [RoomsService, PriceQuoteService, PricePackagesService, TypeOrmModule],
})
export class RoomsModule {}
