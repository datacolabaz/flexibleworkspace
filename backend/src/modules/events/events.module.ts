import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventEntity } from './entities/event.entity';
import { EventLocationEntity } from './entities/event-location.entity';
import { EventRsvpEntity } from './entities/event-rsvp.entity';
import { EventTicketTypeEntity } from './entities/event-ticket-type.entity';
import { EventTicketEntity } from './entities/event-ticket.entity';
import { TicketScanLog } from './entities/ticket-scan-log.entity';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EventEntity,
      EventLocationEntity,
      EventRsvpEntity,
      EventTicketTypeEntity,
      EventTicketEntity,
      TicketScanLog,
    ]),
    StorageModule,
    NotificationsModule,
  ],
  controllers: [EventsController, TicketsController],
  providers: [EventsService, TicketsService],
  exports: [EventsService, TicketsService],
})
export class EventsModule {}
