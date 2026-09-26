import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventEntity } from './entities/event.entity';
import { EventLocationEntity } from './entities/event-location.entity';
import { EventRsvpEntity } from './entities/event-rsvp.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity, EventLocationEntity, EventRsvpEntity]),
    StorageModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
