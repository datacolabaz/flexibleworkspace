import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { randomBytes } from 'crypto';

import { EventEntity, EventFormat, EventStatus, EventVisibility } from './entities/event.entity';
import { EventLocationEntity, EventLocationStatus } from './entities/event-location.entity';
import { EventRsvpEntity, EventRsvpStatus } from './entities/event-rsvp.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateRsvpDto } from './dto/create-rsvp.dto';
import { LinkVenueDto } from './dto/link-venue.dto';
import { DomainException, ResourceNotFoundException } from '../../common/exceptions/domain.exception';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepo: Repository<EventEntity>,
    @InjectRepository(EventLocationEntity)
    private readonly eventLocationsRepo: Repository<EventLocationEntity>,
    @InjectRepository(EventRsvpEntity)
    private readonly rsvpsRepo: Repository<EventRsvpEntity>,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private generateSlug(title: string, suffix: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60);
    return `${base}-${suffix}`;
  }

  private generateConfirmationCode(): string {
    return randomBytes(6).toString('hex').toUpperCase(); // 12 chars
  }

  private assertOrganizer(event: EventEntity, userId: string): void {
    if (event.organizerId !== userId) {
      throw new DomainException(
        'EVENT_FORBIDDEN',
        'Only the organizer can modify this event.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // ── Core CRUD ─────────────────────────────────────────────────────────────

  async createEvent(userId: string, dto: CreateEventDto): Promise<EventEntity> {
    const suffix = randomBytes(3).toString('hex');
    const slug = this.generateSlug(dto.title, suffix);
    const now = new Date();

    const event = this.eventsRepo.create({
      organizerId: userId,
      title: dto.title,
      slug,
      format: dto.format,
      shortDescription: dto.shortDescription ?? '',
      description: dto.description ?? '',
      coverImage: dto.coverImage ?? null,
      language: dto.language ?? 'az',
      capacity: dto.capacity ?? null,
      visibility: dto.visibility ?? EventVisibility.PUBLIC,
      status: EventStatus.DRAFT,
      startAt: new Date(dto.startAt),
      endAt: new Date(dto.endAt),
      rsvpDeadline: dto.rsvpDeadline ? new Date(dto.rsvpDeadline) : null,
      doorsOpenAt: dto.doorsOpenAt ? new Date(dto.doorsOpenAt) : null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      cancelledAt: null,
      deletedAt: null,
    });

    return this.eventsRepo.save(event);
  }

  async updateEvent(userId: string, eventId: string, dto: UpdateEventDto): Promise<EventEntity> {
    const event = await this.findById(eventId);
    this.assertOrganizer(event, userId);

    if (dto.title !== undefined) event.title = dto.title;
    if (dto.format !== undefined) event.format = dto.format as EventFormat;
    if (dto.shortDescription !== undefined) event.shortDescription = dto.shortDescription;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.coverImage !== undefined) event.coverImage = dto.coverImage ?? null;
    if (dto.language !== undefined) event.language = dto.language;
    if (dto.capacity !== undefined) event.capacity = dto.capacity ?? null;
    if (dto.visibility !== undefined) event.visibility = dto.visibility as EventVisibility;
    if (dto.startAt !== undefined) event.startAt = new Date(dto.startAt);
    if (dto.endAt !== undefined) event.endAt = new Date(dto.endAt);
    if (dto.rsvpDeadline !== undefined)
      event.rsvpDeadline = dto.rsvpDeadline ? new Date(dto.rsvpDeadline) : null;
    if (dto.doorsOpenAt !== undefined)
      event.doorsOpenAt = dto.doorsOpenAt ? new Date(dto.doorsOpenAt) : null;

    event.updatedAt = new Date();
    return this.eventsRepo.save(event);
  }

  async publishEvent(userId: string, eventId: string): Promise<EventEntity> {
    const event = await this.findById(eventId);
    this.assertOrganizer(event, userId);

    // Validation rules
    if (!event.title?.trim()) {
      throw new DomainException('EVENT_VALIDATION', 'Title is required.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (!event.description?.trim()) {
      throw new DomainException('EVENT_VALIDATION', 'Description is required.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (event.startAt >= event.endAt) {
      throw new DomainException('EVENT_VALIDATION', 'end_at must be after start_at.', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const now = new Date();
    event.status = EventStatus.RSVP_OPEN;
    event.publishedAt = now;
    event.updatedAt = now;
    return this.eventsRepo.save(event);
  }

  // ── Reads ─────────────────────────────────────────────────────────────────

  async getEventBySlug(slug: string): Promise<EventEntity & { rsvpCount: number }> {
    const event = await this.eventsRepo.findOne({
      where: { slug, deletedAt: IsNull() },
      relations: ['eventLocations'],
    });
    if (!event) throw new ResourceNotFoundException('Event');

    const rsvpCount = await this.rsvpsRepo.count({
      where: { eventId: event.id, status: EventRsvpStatus.CONFIRMED },
    });
    return Object.assign(event, { rsvpCount });
  }

  async getEventById(eventId: string): Promise<EventEntity & { rsvpCount: number }> {
    const event = await this.findById(eventId);
    const rsvpCount = await this.rsvpsRepo.count({
      where: { eventId: event.id, status: EventRsvpStatus.CONFIRMED },
    });
    return Object.assign(event, { rsvpCount });
  }

  async listPublicEvents(filters: {
    format?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: EventEntity[]; total: number }> {
    const qb = this.eventsRepo
      .createQueryBuilder('e')
      .where('e.deleted_at IS NULL')
      .andWhere('e.status IN (:...statuses)', {
        statuses: [EventStatus.PUBLISHED, EventStatus.RSVP_OPEN, EventStatus.SOLD_OUT],
      })
      .orderBy('e.start_at', 'ASC');

    if (filters.format) {
      qb.andWhere('e.format = :format', { format: filters.format });
    }

    const total = await qb.getCount();
    const items = await qb
      .limit(filters.limit ?? 20)
      .offset(filters.offset ?? 0)
      .getMany();

    return { items, total };
  }

  async getOrganizerEvents(userId: string): Promise<(EventEntity & { rsvpCount: number })[]> {
    const events = await this.eventsRepo.find({
      where: { organizerId: userId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    const enriched = await Promise.all(
      events.map(async (event) => {
        const rsvpCount = await this.rsvpsRepo.count({
          where: { eventId: event.id, status: EventRsvpStatus.CONFIRMED },
        });
        return Object.assign(event, { rsvpCount });
      }),
    );
    return enriched;
  }

  // ── RSVP ─────────────────────────────────────────────────────────────────

  async createRsvp(
    dto: CreateRsvpDto,
    userId?: string,
  ): Promise<EventRsvpEntity> {
    const event = await this.findById(dto.eventId);

    if (
      event.status !== EventStatus.RSVP_OPEN &&
      event.status !== EventStatus.PUBLISHED
    ) {
      throw new DomainException(
        'RSVP_NOT_OPEN',
        'RSVP is not open for this event.',
        HttpStatus.CONFLICT,
      );
    }

    // Capacity check
    if (event.capacity !== null) {
      const confirmed = await this.rsvpsRepo.count({
        where: { eventId: event.id, status: EventRsvpStatus.CONFIRMED },
      });
      if (confirmed >= event.capacity) {
        // Mark sold out
        event.status = EventStatus.SOLD_OUT;
        event.updatedAt = new Date();
        await this.eventsRepo.save(event);
        throw new DomainException('EVENT_SOLD_OUT', 'This event is sold out.', HttpStatus.CONFLICT);
      }
    }

    const confirmationCode = this.generateConfirmationCode();
    const now = new Date();

    const rsvp = this.rsvpsRepo.create({
      eventId: dto.eventId,
      userId: userId ?? null,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      status: EventRsvpStatus.CONFIRMED,
      confirmationCode,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.rsvpsRepo.save(rsvp);

    // Re-check capacity after saving — mark sold out if now full
    if (event.capacity !== null) {
      const total = await this.rsvpsRepo.count({
        where: { eventId: event.id, status: EventRsvpStatus.CONFIRMED },
      });
      if (total >= event.capacity) {
        event.status = EventStatus.SOLD_OUT;
        event.updatedAt = new Date();
        await this.eventsRepo.save(event);
      }
    }

    return saved;
  }

  // ── Venue linking ─────────────────────────────────────────────────────────

  async linkVenueToEvent(
    userId: string,
    eventId: string,
    dto: LinkVenueDto,
  ): Promise<EventLocationEntity> {
    const event = await this.findById(eventId);
    this.assertOrganizer(event, userId);

    // Remove existing pending venue links (single-venue MVP)
    await this.eventLocationsRepo.delete({ eventId });

    const now = new Date();
    const el = this.eventLocationsRepo.create({
      eventId,
      locationId: dto.locationId,
      bookingId: dto.bookingId ?? null,
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(dto.endAt) : null,
      status: dto.bookingId ? EventLocationStatus.CONFIRMED : EventLocationStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.eventLocationsRepo.save(el);

    // If event is still draft, move to venue_pending (if venue not yet confirmed)
    if (event.status === EventStatus.DRAFT) {
      event.status = dto.bookingId ? EventStatus.DRAFT : EventStatus.VENUE_PENDING;
      event.updatedAt = now;
      await this.eventsRepo.save(event);
    }

    return saved;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async findById(eventId: string): Promise<EventEntity> {
    const event = await this.eventsRepo.findOne({
      where: { id: eventId, deletedAt: IsNull() },
    });
    if (!event) throw new ResourceNotFoundException('Event');
    return event;
  }
}
