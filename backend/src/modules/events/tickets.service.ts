import { HttpStatus, Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

import { EventEntity, EventStatus } from './entities/event.entity';
import { EventTicketTypeEntity } from './entities/event-ticket-type.entity';
import { EventTicketEntity, EventTicketStatus } from './entities/event-ticket.entity';
import { TicketScanLog } from './entities/ticket-scan-log.entity';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepo: Repository<EventEntity>,
    @InjectRepository(EventTicketTypeEntity)
    private readonly ticketTypesRepo: Repository<EventTicketTypeEntity>,
    @InjectRepository(EventTicketEntity)
    private readonly ticketsRepo: Repository<EventTicketEntity>,
    @InjectRepository(TicketScanLog)
    private readonly scanLogRepo: Repository<TicketScanLog>,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findEventById(eventId: string): Promise<EventEntity> {
    const event = await this.eventsRepo.findOne({ where: { id: eventId } });
    if (!event || event.deletedAt) throw new ResourceNotFoundException('Event');
    return event;
  }

  private assertOrganizer(event: EventEntity, userId: string): void {
    if (event.organizerId !== userId) {
      throw new DomainException(
        'EVENT_FORBIDDEN',
        'Only the organizer can perform this action.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Returns { rawToken, tokenHash }. Store tokenHash; return rawToken once to caller. */
  private generateQrToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, tokenHash };
  }

  private async insertScanLog(
    ticketId: string,
    eventId: string,
    scannerUserId: string,
    result: string,
    reason: string | null,
  ): Promise<void> {
    try {
      await this.scanLogRepo.save({
        ticketId,
        eventId,
        scannerUserId,
        result,
        reason: reason ?? undefined,
      });
    } catch (_e) {
      // fire-and-forget — never throw
    }
  }

  // ── Ticket types ──────────────────────────────────────────────────────────

  async createTicketType(
    eventId: string,
    organizerId: string,
    dto: CreateTicketTypeDto,
  ): Promise<EventTicketTypeEntity> {
    const event = await this.findEventById(eventId);
    this.assertOrganizer(event, organizerId);

    const now = new Date();
    const tt = this.ticketTypesRepo.create({
      eventId,
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      currency: dto.currency ?? 'AZN',
      quantityTotal: dto.quantityTotal ?? null,
      quantitySold: 0,
      isActive: dto.isActive ?? true,
      saleStartsAt: dto.saleStartsAt ? new Date(dto.saleStartsAt) : null,
      saleEndsAt: dto.saleEndsAt ? new Date(dto.saleEndsAt) : null,
      createdAt: now,
    });

    // Auto-enable tickets on event
    if (!event.ticketsEnabled) {
      event.ticketsEnabled = true;
      event.updatedAt = now;
      await this.eventsRepo.save(event);
    }

    return this.ticketTypesRepo.save(tt);
  }

  async getTicketTypes(eventId: string): Promise<EventTicketTypeEntity[]> {
    // Validate event exists
    await this.findEventById(eventId);
    return this.ticketTypesRepo.find({
      where: { eventId, isActive: true },
      order: { price: 'ASC', createdAt: 'ASC' },
    });
  }

  // ── Ticket purchase ───────────────────────────────────────────────────────

  /**
   * Purchase one ticket of a given type.
   *
   * Free tickets  → confirmed immediately, QR generated.
   *                 Returns rawToken (never stored plaintext).
   * Paid tickets  → created as `pending`, returns paymentRequired flag.
   *                 Payment gateway integration (Epoint/Payriff) can be
   *                 wired in a follow-up pass once the event-payment
   *                 checkout flow is designed.
   */
  async purchaseTicket(
    ticketTypeId: string,
    userId: string,
    dto: PurchaseTicketDto,
  ): Promise<
    | { paymentRequired: false; ticket: EventTicketEntity; rawToken: string }
    | { paymentRequired: true; ticketId: string; amount: number; currency: string }
  > {
    const ticketType = await this.ticketTypesRepo.findOne({
      where: { id: ticketTypeId, isActive: true },
    });
    if (!ticketType) throw new ResourceNotFoundException('TicketType');

    const event = await this.findEventById(ticketType.eventId);

    // Event must be open
    if (
      ![EventStatus.PUBLISHED, EventStatus.RSVP_OPEN].includes(
        event.status as EventStatus,
      )
    ) {
      throw new DomainException(
        'EVENT_NOT_OPEN',
        'This event is not currently accepting tickets.',
        HttpStatus.CONFLICT,
      );
    }

    // Sale window check
    const now = new Date();
    if (ticketType.saleStartsAt && now < ticketType.saleStartsAt) {
      throw new DomainException('SALE_NOT_STARTED', 'Ticket sale has not started yet.', HttpStatus.CONFLICT);
    }
    if (ticketType.saleEndsAt && now > ticketType.saleEndsAt) {
      throw new DomainException('SALE_ENDED', 'Ticket sale has ended.', HttpStatus.CONFLICT);
    }

    // Capacity check
    if (
      ticketType.quantityTotal !== null &&
      ticketType.quantitySold >= ticketType.quantityTotal
    ) {
      throw new DomainException('SOLD_OUT', 'This ticket type is sold out.', HttpStatus.CONFLICT);
    }

    // FIX 3: Duplicate purchase guard — prevent re-registration
    const existing = await this.ticketsRepo.findOne({
      where: [
        { userId, eventId: ticketType.eventId, status: EventTicketStatus.CONFIRMED },
        { userId, eventId: ticketType.eventId, status: EventTicketStatus.PENDING },
      ],
    });
    if (existing) {
      throw new DomainException(
        'ALREADY_REGISTERED',
        'You already have a ticket for this event.',
        HttpStatus.CONFLICT,
      );
    }

    const isFree = Number(ticketType.price) === 0;

    let rawTokenForResponse: string | null = null;
    let tokenHashToStore: string | null = null;

    if (isFree) {
      const { rawToken, tokenHash } = this.generateQrToken();
      rawTokenForResponse = rawToken;
      tokenHashToStore = tokenHash;
    }

    const ticket = this.ticketsRepo.create({
      ticketTypeId,
      eventId: ticketType.eventId,
      userId,
      orderId: null,
      status: isFree ? EventTicketStatus.CONFIRMED : EventTicketStatus.PENDING,
      // FIX 1: store SHA-256 hash, not plaintext token
      qrCode: isFree ? tokenHashToStore : null,
      checkedInAt: null,
      checkedInBy: null,
      amountPaid: Number(ticketType.price),
      currency: ticketType.currency,
      buyerName: dto.buyerName ?? null,
      buyerEmail: dto.buyerEmail ?? null,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await this.ticketsRepo.save(ticket);

    // Increment quantity_sold
    await this.ticketTypesRepo.increment({ id: ticketTypeId }, 'quantitySold', 1);

    if (isFree) {
      // FIX 5: Email confirmation — fire-and-forget, never throws
      const capturedRawToken = rawTokenForResponse!;
      const capturedTicket = saved;
      const capturedEvent = event;
      const capturedTicketType = ticketType;
      setImmediate(async () => {
        try {
          if (!capturedTicket.buyerEmail) return;
          const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a5c38;">İştirak Təsdiqi ✅</h2>
              <p>Salam <strong>${capturedTicket.buyerName ?? 'İştirakçı'}</strong>,</p>
              <p><strong>${capturedEvent.title}</strong> tədbirinizə qeydiyyatınız təsdiqləndi.</p>
              <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
                <tr><td style="padding: 8px; color: #666;">Bilet:</td><td style="padding: 8px;"><strong>${capturedTicketType.name}</strong></td></tr>
              </table>
              <div style="text-align: center; margin: 24px 0;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${capturedRawToken}" width="200" height="200" alt="QR kod" />
              </div>
              <p style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://spotva.co'}/az/tickets/${capturedRawToken}"
                   style="background: #e8601c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Bileti aç →
                </a>
              </p>
              <p style="color: #888; font-size: 12px; text-align: center;">Spotva &middot; spotva.co</p>
            </div>
          `;
          await this.notificationsService.send({
            userId,
            channel: 'EMAIL',
            templateKey: 'ticket.confirmed',
            locale: 'az',
            recipient: capturedTicket.buyerEmail,
            subject: `[${capturedEvent.title}] — İştirak Təsdiqi`,
            body: emailHtml,
          });
        } catch (e: any) {
          // log but don't throw
          console.error('[TicketsService] email send failed:', e?.message);
        }
      });

      return { paymentRequired: false, ticket: saved, rawToken: capturedRawToken };
    }

    return {
      paymentRequired: true,
      ticketId: saved.id,
      amount: Number(ticketType.price),
      currency: ticketType.currency,
    };
  }

  /** Confirm a paid ticket after payment success. */
  async confirmTicket(ticketId: string, orderId: string): Promise<{ ticket: EventTicketEntity; rawToken: string }> {
    const ticket = await this.ticketsRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new ResourceNotFoundException('Ticket');
    if (ticket.status === EventTicketStatus.CONFIRMED && ticket.qrCode) {
      // Already confirmed — can't return the raw token again safely
      return { ticket, rawToken: '[already-confirmed]' };
    }

    const { rawToken, tokenHash } = this.generateQrToken();
    ticket.status = EventTicketStatus.CONFIRMED;
    // FIX 1: store hash, not raw token
    ticket.qrCode = tokenHash;
    ticket.orderId = orderId;
    ticket.updatedAt = new Date();
    const saved = await this.ticketsRepo.save(ticket);
    return { ticket: saved, rawToken };
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  /**
   * FIX 1 + FIX 2: Receive raw token, hash it, then atomically UPDATE
   * the ticket from confirmed → used in a single DB round-trip.
   * Prevents race conditions (double scan) without locking.
   */
  async checkIn(
    rawToken: string,
    checkerId: string,
  ): Promise<{ success: boolean; ticket: EventTicketEntity; attendeeName: string }> {
    // FIX 1: hash the incoming raw token to look up stored hash
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Validate checker is organizer before doing anything
    // (We need the event — look up via ticket first, then validate)
    const ticketForAuth = await this.ticketsRepo.findOne({
      where: { qrCode: tokenHash },
    });
    if (!ticketForAuth) {
      // FIX 4: log failed scan attempt (no ticket — can't log event/ticket ids meaningfully)
      // We skip log here since we don't have valid IDs; return error directly
      throw new DomainException(
        'TICKET_NOT_FOUND',
        'Invalid QR code — ticket not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const event = await this.findEventById(ticketForAuth.eventId);

    try {
      this.assertOrganizer(event, checkerId);
    } catch (e) {
      await this.insertScanLog(ticketForAuth.id, ticketForAuth.eventId, checkerId, 'unauthorized', 'checker is not organizer');
      throw e;
    }

    // FIX 2: Atomic UPDATE — only succeeds if status is currently 'confirmed'
    const result = await this.ticketsRepo
      .createQueryBuilder()
      .update(EventTicketEntity)
      .set({
        status: EventTicketStatus.USED,
        checkedInAt: new Date(),
        checkedInBy: checkerId,
        updatedAt: new Date(),
      })
      .where('qr_code = :tokenHash AND status = :status', {
        tokenHash,
        status: EventTicketStatus.CONFIRMED,
      })
      .returning('*')
      .execute();

    if (result.affected === 0) {
      // Distinguish: already checked-in vs cancelled/pending
      const ticket = await this.ticketsRepo.findOne({ where: { qrCode: tokenHash } });
      if (!ticket) {
        await this.insertScanLog(ticketForAuth.id, ticketForAuth.eventId, checkerId, 'invalid_token', 'ticket disappeared');
        throw new DomainException('TICKET_NOT_FOUND', 'Invalid QR code — ticket not found.', HttpStatus.NOT_FOUND);
      }
      if (ticket.status === EventTicketStatus.USED) {
        await this.insertScanLog(ticket.id, ticket.eventId, checkerId, 'duplicate', 'already checked in');
        throw new DomainException('ALREADY_CHECKED_IN', 'This ticket has already been used for check-in.', HttpStatus.CONFLICT);
      }
      await this.insertScanLog(ticket.id, ticket.eventId, checkerId, `not_confirmed`, `status=${ticket.status}`);
      throw new DomainException(
        'TICKET_NOT_CONFIRMED',
        'This ticket is not in a confirmed state.',
        HttpStatus.CONFLICT,
      );
    }

    // Use the returned raw row if available, otherwise re-fetch
    const updatedTicket: EventTicketEntity =
      result.raw[0]
        ? Object.assign(new EventTicketEntity(), result.raw[0])
        : (await this.ticketsRepo.findOne({ where: { qrCode: tokenHash }, relations: ['ticketType'] }))!;

    // FIX 4: Log successful scan
    await this.insertScanLog(updatedTicket.id, updatedTicket.eventId, checkerId, 'success', null);

    return {
      success: true,
      ticket: updatedTicket,
      attendeeName: updatedTicket.buyerName ?? 'İştirakçı',
    };
  }

  // ── Listings ──────────────────────────────────────────────────────────────

  /**
   * FIX 1: Do NOT expose qrCode (hash) to the list endpoint.
   * Strip it before returning.
   */
  async getMyTickets(userId: string): Promise<Omit<EventTicketEntity, 'qrCode'>[]> {
    const tickets = await this.ticketsRepo.find({
      where: { userId },
      relations: ['ticketType', 'event'],
      order: { createdAt: 'DESC' },
    });
    // Omit qrCode / tokenHash from list response — consumers should never see the stored hash
    return tickets.map(({ qrCode: _omitted, ...rest }) => rest as Omit<EventTicketEntity, 'qrCode'>);
  }

  async getEventAttendees(
    eventId: string,
    organizerId: string,
  ): Promise<{ tickets: EventTicketEntity[]; checkedIn: number; total: number }> {
    const event = await this.findEventById(eventId);
    this.assertOrganizer(event, organizerId);

    const tickets = await this.ticketsRepo.find({
      where: { eventId, status: EventTicketStatus.CONFIRMED },
      relations: ['ticketType'],
      order: { createdAt: 'ASC' },
    });

    const used = await this.ticketsRepo.count({
      where: { eventId, status: EventTicketStatus.USED },
    });

    const allConfirmed = await this.ticketsRepo.count({
      where: { eventId, status: EventTicketStatus.CONFIRMED },
    });

    return {
      tickets,
      checkedIn: used,
      total: allConfirmed + used,
    };
  }
}
