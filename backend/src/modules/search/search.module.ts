import { Module } from '@nestjs/common';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/**
 * No TypeOrmModule.forFeature() here — SearchService only ever queries
 * through raw SQL via the injected DataSource (16_SEARCH_ARCHITECTURE.md
 * §16.1/§16.2: one composed query spanning room/location/provider/room_type/
 * amenity/photo/booking_item/availability_rule/blocked_period/holiday — far
 * beyond what a single entity's repository would express, and it already
 * has to be raw SQL for the PostGIS predicates regardless).
 */
@Module({
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
