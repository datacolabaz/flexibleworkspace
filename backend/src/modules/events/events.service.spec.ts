import { EventsService } from './events.service';
import { EventEntity, EventStatus, EventVisibility } from './entities/event.entity';
import { EventRsvpEntity, EventRsvpStatus } from './entities/event-rsvp.entity';
import { DomainException, ResourceNotFoundException } from '../../common/exceptions/domain.exception';

function publishedEvent(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    id: 'event-1',
    organizerId: 'org-1',
    title: 'Workshop',
    slug: 'workshop-abc',
    status: EventStatus.RSVP_OPEN,
    visibility: EventVisibility.PUBLIC,
    capacity: null,
    rsvpDeadline: null,
    deletedAt: null,
    ...overrides,
  } as EventEntity;
}

describe('EventsService.createRsvp', () => {
  let eventsRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let rsvpsRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    manager: { transaction: (cb: (em: unknown) => Promise<unknown>) => Promise<unknown> };
  };
  let service: EventsService;

  beforeEach(() => {
    eventsRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (e) => e),
    };
    rsvpsRepo = {
      create: jest.fn((data) => ({ id: 'rsvp-1', ...data })),
      save: jest.fn(async (e) => e),
      findOne: jest.fn(),
      count: jest.fn(async () => 0),
      manager: {
        transaction: (cb) =>
          cb({
            getRepository: (entity: unknown) =>
              entity === EventEntity ? eventsRepo : rsvpsRepo,
          }),
      },
    };
    service = new EventsService(
      eventsRepo as never,
      {} as never,
      rsvpsRepo as never,
      {} as never,
    );
  });

  it('creates a guest RSVP without a user id', async () => {
    eventsRepo.findOne.mockResolvedValue(publishedEvent());
    rsvpsRepo.findOne.mockResolvedValue(null);

    const saved = await service.createRsvp(
      'event-1',
      { name: ' Aysel ', email: 'Aysel@Example.com', phone: '  ' },
      undefined,
    );

    expect(saved.userId).toBeNull();
    expect(saved.email).toBe('aysel@example.com');
    expect(saved.name).toBe('Aysel');
    expect(saved.phone).toBeNull();
    expect(saved.status).toBe(EventRsvpStatus.CONFIRMED);
    expect(saved.confirmationCode).toHaveLength(12);
  });

  it('attaches the authenticated user id', async () => {
    eventsRepo.findOne.mockResolvedValue(publishedEvent());
    rsvpsRepo.findOne.mockResolvedValue(null);

    const saved = await service.createRsvp(
      'event-1',
      { name: 'Aysel', email: 'aysel@example.com' },
      'user-99',
    );

    expect(saved.userId).toBe('user-99');
  });

  it('rejects RSVP on a draft event', async () => {
    eventsRepo.findOne.mockResolvedValue(publishedEvent({ status: EventStatus.DRAFT }));

    await expect(
      service.createRsvp('event-1', { name: 'Aysel', email: 'a@b.com' }),
    ).rejects.toMatchObject({ code: 'RSVP_NOT_OPEN' });
  });

  it('rejects a duplicate confirmed email', async () => {
    eventsRepo.findOne.mockResolvedValue(publishedEvent());
    rsvpsRepo.findOne.mockResolvedValue({ id: 'existing' } as EventRsvpEntity);

    await expect(
      service.createRsvp('event-1', { name: 'Aysel', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(DomainException);
    await expect(
      service.createRsvp('event-1', { name: 'Aysel', email: 'a@b.com' }),
    ).rejects.toMatchObject({ code: 'RSVP_DUPLICATE' });
  });

  it('rejects when the event is missing', async () => {
    eventsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createRsvp('missing', { name: 'Aysel', email: 'a@b.com' }),
    ).rejects.toBeInstanceOf(ResourceNotFoundException);
  });
});
