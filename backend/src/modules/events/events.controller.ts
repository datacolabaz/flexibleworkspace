import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateRsvpDto } from './dto/create-rsvp.dto';
import { LinkVenueDto } from './dto/link-venue.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ── Authenticated organizer endpoints ────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a new event (draft)' })
  async createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.createEvent(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: "Get the authenticated organizer's events" })
  async getMyEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.getOrganizerEvents(user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event (organizer only)' })
  async updateEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.updateEvent(user.userId, id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish an event (organizer only)' })
  async publishEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.eventsService.publishEvent(user.userId, id);
  }

  @Post(':id/venue')
  @ApiOperation({ summary: 'Link a venue/booking to an event (organizer only)' })
  async linkVenue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LinkVenueDto,
  ) {
    return this.eventsService.linkVenueToEvent(user.userId, id, dto);
  }

  // ── Public endpoints ─────────────────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public events' })
  async listEvents(
    @Query('format') format?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.eventsService.listPublicEvents({
      format,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get a public event by slug or id' })
  async getEvent(@Param('slug') slug: string) {
    // Accept both slug (string) and UUID — try slug first
    return this.eventsService.getEventBySlug(slug);
  }

  @Public()
  @Post(':id/rsvp')
  @ApiOperation({ summary: 'Create an RSVP for an event' })
  async createRsvp(
    @Param('id') id: string,
    @Body() dto: CreateRsvpDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.eventsService.createRsvp({ ...dto, eventId: id }, user?.userId);
  }
}
