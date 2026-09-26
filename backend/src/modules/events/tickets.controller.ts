import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { TicketsService } from './tickets.service';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';

@ApiTags('Tickets')
@Controller()
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // ── Ticket types ──────────────────────────────────────────────────────────

  @Post('events/:id/ticket-types')
  @ApiOperation({ summary: 'Create a ticket type for an event (organizer only)' })
  async createTicketType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.ticketsService.createTicketType(id, user.userId, dto);
  }

  @Public()
  @Get('events/:id/ticket-types')
  @ApiOperation({ summary: 'List ticket types for an event (public)' })
  async getTicketTypes(@Param('id') id: string) {
    return this.ticketsService.getTicketTypes(id);
  }

  // ── Purchase ──────────────────────────────────────────────────────────────

  @Post('ticket-types/:typeId/purchase')
  @ApiOperation({ summary: 'Purchase a ticket (auth required)' })
  async purchaseTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Param('typeId') typeId: string,
    @Body() dto: PurchaseTicketDto,
  ) {
    return this.ticketsService.purchaseTicket(typeId, user.userId, dto);
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  @Post('tickets/:qrCode/check-in')
  @ApiOperation({ summary: 'Check in an attendee by QR token (organizer auth)' })
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('qrCode') qrCode: string,
  ) {
    return this.ticketsService.checkIn(qrCode, user.userId);
  }

  // ── My tickets ────────────────────────────────────────────────────────────

  @Get('tickets/me')
  @ApiOperation({ summary: "Get the authenticated user's purchased tickets" })
  async getMyTickets(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketsService.getMyTickets(user.userId);
  }

  // ── Attendee list (organizer) ─────────────────────────────────────────────

  @Get('events/:id/attendees')
  @ApiOperation({ summary: 'List attendees for an event (organizer only)' })
  async getEventAttendees(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.ticketsService.getEventAttendees(id, user.userId);
  }
}
