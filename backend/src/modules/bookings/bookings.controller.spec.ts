import { Test, TestingModule } from '@nestjs/testing';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { DomainException } from '../../common/exceptions/domain.exception';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';

/**
 * Covers `GET /bookings/:bookingId`'s optional-auth ownership rule —
 * `@Public()` with an optional `@CurrentUser()`, not a hard auth wall — see
 * the controller's own doc comment for why: guest checkout
 * (`POST /bookings` is itself `@Public()`) provisions a user with no JWT,
 * so a guest who just booked has no session to prove ownership with, yet
 * the backend's own `payments.successUrlTemplate` config already commits
 * to sending that guest back to a frontend page that needs to read this
 * booking's status. This is a controller unit test (mocked service), not
 * an HTTP/supertest test, matching this codebase's existing "e2e" tests
 * (bookings-concurrency, search, payments), which all call services/
 * controllers directly rather than through supertest.
 */
describe('BookingsController.getOne', () => {
  let controller: BookingsController;
  const findByIdMock = jest.fn();

  const booking = {
    id: 'booking-1',
    customerUserId: 'owner-user',
    status: 'PENDING',
    items: [],
  };

  beforeEach(async () => {
    findByIdMock.mockReset();
    findByIdMock.mockResolvedValue(booking);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: { findById: findByIdMock } },
        { provide: AvailabilityService, useValue: {} },
      ],
    }).compile();

    controller = module.get(BookingsController);
  });

  it('returns the booking to an anonymous (guest) caller — possession of the opaque id is the gate', async () => {
    const result = await controller.getOne('booking-1', undefined);
    expect(result).toBe(booking);
  });

  it('returns the booking to the authenticated owner', async () => {
    const user = {
      userId: 'owner-user',
      email: null,
      phone: null,
      roles: [],
    } as AuthenticatedUser;
    const result = await controller.getOne('booking-1', user);
    expect(result).toBe(booking);
  });

  it('404s a non-owning authenticated caller (never reveals the booking exists)', async () => {
    const user = {
      userId: 'someone-else',
      email: null,
      phone: null,
      roles: [],
    } as AuthenticatedUser;
    await expect(controller.getOne('booking-1', user)).rejects.toThrow(
      DomainException,
    );
  });
});
