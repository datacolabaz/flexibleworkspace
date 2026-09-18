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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoomEntity,
      AmenityEntity,
      RoomTypeEntity,
      AvailabilityRuleEntity,
      BlockedPeriodEntity,
      PhotoEntity,
    ]),
    LocationsModule,
    ProvidersModule,
    StorageModule,
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService, TypeOrmModule],
})
export class RoomsModule {}
