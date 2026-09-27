import { TicketsService } from './tickets.service';
import { EventEntity } from './entities/event.entity';
import { EventRsvpEntity, EventRsvpStatus } from './entities/event-rsvp.entity';
import { EventTicketEntity } from './entities/event-ticket.entity';
import { DomainException } from '../../common/exceptions/domain.exception';

describe('TicketsService.checkIn RSVP confirmation code', () => {
  let ticketsRepo: { findOne: jest.Mock };
  let eventsRepo: { findOne: jest.Mock };
  let rsvpsRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { transaction: (cb: (em: unknown) => Promise<unknown>) => Promise<unknown> };
  };
  let service: TicketsService;

  beforeEach(() => {
    ticketsRepo = { findOne: jest.fn() };
    eventsRepo = { findOne: jest.fn() };
    rsvpsRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (e) => e),
      manager: {
        transaction: (cb) =>
          cb({
            getRepository: (entity: unknown) =>
              entity === EventRsvpEntity ? rsvpsRepo : eventsRepo,
          }),
      },
    };
    service = new TicketsService(
      eventsRepo as never,
      {} as never,
      ticketsRepo as never,
      { save: jest.fn() } as never,
      rsvpsRepo as never,
      {} as never,
    );
  });

  it('checks in a confirmed RSVP when the scan is the confirmation code', async () => {
    ticketsRepo.findOne.mockResolvedValue(null);
    eventsRepo.findOne.mockResolvedValue({
      id: 'event-1',
      organizerId: 'org-1',
      deletedAt: null,
    } as EventEntity);
    rsvpsRepo.findOne.mockResolvedValue({
      id: 'rsvp-1',
      eventId: 'event-1',
      name: 'Aysel',
      email: 'aysel@example.com',
      status: EventRsvpStatus.CONFIRMED,
      confirmationCode: '38F7A2C17DE0',
      checkedInAt: null,
      checkedInBy: null,
    } as EventRsvpEntity);

    const result = await service.checkIn('38F7A2C17DE0', 'org-1');

    expect(result.success).toBe(true);
    expect(result.attendeeName).toBe('Aysel');
    expect(result.ticket).toBeInstanceOf(EventTicketEntity);
    expect(rsvpsRepo.save).toHaveBeenCalled();
  });

  it('rejects an unknown confirmation code', async () => {
    ticketsRepo.findOne.mockResolvedValue(null);
    rsvpsRepo.findOne.mockResolvedValue(null);

    await expect(service.checkIn('NOPE', 'org-1')).rejects.toMatchObject({
      code: 'TICKET_NOT_FOUND',
    });
  });

  it('rejects a duplicate RSVP scan', async () => {
    ticketsRepo.findOne.mockResolvedValue(null);
    eventsRepo.findOne.mockResolvedValue({
      id: 'event-1',
      organizerId: 'org-1',
      deletedAt: null,
    } as EventEntity);
    rsvpsRepo.findOne.mockResolvedValue({
      id: 'rsvp-1',
      eventId: 'event-1',
      name: 'Aysel',
      email: 'aysel@example.com',
      status: EventRsvpStatus.CONFIRMED,
      confirmationCode: '38F7A2C17DE0',
      checkedInAt: new Date(),
      checkedInBy: 'org-1',
    } as EventRsvpEntity);

    await expect(service.checkIn('38F7A2C17DE0', 'org-1')).rejects.toBeInstanceOf(
      DomainException,
    );
    await expect(service.checkIn('38F7A2C17DE0', 'org-1')).rejects.toMatchObject({
      code: 'ALREADY_CHECKED_IN',
    });
  });
});
