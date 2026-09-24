import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { BookingsService } from './bookings.service';
import { AvailabilityService } from './availability.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AcceptBookingDto } from './dto/accept-booking.dto';
import { RejectBookingDto } from './dto/reject-booking.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RoleName } from '../../common/constants/roles.enum';
import { BookingStatus } from '../../common/constants/booking.enum';
import { REFERRAL_ATTRIBUTION_COOKIE_NAME } from '../../common/constants/partner.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { DomainException } from '../../common/exceptions/domain.exception';

@ApiTags('Rooms')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Public()
  @Get('spaces/:roomId/availability')
  @ApiOperation({
    summary:
      'Live availability for a room/date (12_RESERVATION_ENGINE.md §12.1)',
  })
  async getAvailability(
    @Param('roomId') roomId: string,
    @Query('date') date: string,
  ) {
    const windows = await this.availabilityService.getOpenWindows(roomId, date);
    return {
      slots: windows.map((w) => ({
        startAt: w.startAt.toISOString(),
        endAt: w.endAt.toISOString(),
      })),
    };
  }

  @Public()
  @Post('bookings')
  @ApiOperation({
    summary:
      'Create a booking hold (DRAFT/PENDING) — guest or authenticated (12_RESERVATION_ENGINE.md §12.3)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
  ) {
    // 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 step 4 — the ONLY place the
    // referral attribution cookie is ever read. It's an opaque token; the
    // real verification (does it map to a real, unexpired click? an active
    // campaign? an active partner?) happens server-side in
    // ReferralTrackingService.attributeBooking, never trusted here.
    const attributionToken =
      (req.cookies?.[REFERRAL_ATTRIBUTION_COOKIE_NAME] as string | undefined) ??
      null;
    return this.bookingsService.create(
      user?.userId ?? null,
      dto,
      attributionToken,
    );
  }

  /**
   * `@Public()` with an optional `@CurrentUser()`, not a hard auth
   * requirement — same reasoning `PaymentsService.createCheckoutSession`
   * already uses for this exact booking-by-id lookup: `POST /bookings` is
   * itself `@Public()` (guest checkout, 05_USER_FLOWS.md §5.2), and guest
   * checkout provisions a user via `AuthService.ensureUser()` without
   * issuing a JWT, so a guest who just booked has no session to prove
   * ownership with. Found while building the payment-confirmation page,
   * which the backend's own `payments.successUrlTemplate`/
   * `errorUrlTemplate` config (`{CORS_ORIGIN}/booking/{bookingId}/confirming`)
   * already commits to redirecting a payer — guest or not — back to,
   * expecting it to be able to show booking status. Without this, that
   * page would 401 for every guest booking, the primary case
   * `POST /bookings` was built to support. Possession of the booking's
   * opaque UUID (only ever returned to the browser that created it) is
   * the gate for a guest; an authenticated caller still gets the existing
   * ownership check, so a logged-in customer still can't page through
   * someone else's bookings.
   */
  @Public()
  @Get('bookings/:bookingId')
  @ApiOperation({
    summary:
      'Get booking detail — guest (by opaque id) or the owning authenticated customer',
  })
  async getOne(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    const booking = await this.bookingsService.findById(bookingId);
    // Ownership check at the service/query boundary (11_API_CONTRACTS.md
    // §11.4) — a crafted request for someone else's booking 404s, it never
    // reveals that the ID exists. Only enforced when the caller is
    // authenticated; an anonymous caller has already proven "possession"
    // by knowing the UUID itself (see the doc comment above).
    // Provider-side booking access is exposed via /provider/bookings instead of this endpoint.
    if (user && booking.customerUserId !== user.userId) {
      throw new DomainException(
        'NOT_FOUND',
        'Booking not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return booking;
  }

  @Get('account/bookings')
  @ApiOperation({
    summary: 'My bookings, filterable by upcoming/past/cancelled',
  })
  async myBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: 'upcoming' | 'past' | 'cancelled',
  ) {
    return this.bookingsService.listForCustomer(user.userId, status);
  }

  @Get('provider/bookings')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'Bookings across my rooms' })
  async providerBookings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: BookingStatus,
    @Query('roomId') roomId?: string,
    @Query('locationId') locationId?: string,
  ) {
    const providerId = currentProviderId(user);
    if (!providerId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (status && !Object.values(BookingStatus).includes(status)) {
      throw new DomainException(
        'INVALID_STATUS',
        `Unknown booking status "${status}".`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.bookingsService.listForProvider(providerId, {
      status,
      roomId,
      locationId,
    });
  }

  /**
   * T4 — REQUEST_BASED only (BookingsService.acceptBooking enforces this,
   * along with ownership and provider-verification checks).
   */
  @Patch('provider/bookings/:bookingId/accept')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'Accept a PENDING request-based booking' })
  async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: AcceptBookingDto,
  ) {
    const providerId = currentProviderId(user);
    if (!providerId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.bookingsService.acceptBooking(
      providerId,
      bookingId,
      dto.providerNote,
    );
  }

  @Patch('provider/bookings/:bookingId/reject')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'Reject a PENDING request-based booking' })
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: RejectBookingDto,
  ) {
    const providerId = currentProviderId(user);
    if (!providerId) {
      throw new DomainException(
        'NOT_A_PROVIDER',
        'You do not have a provider account.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.bookingsService.rejectBooking(
      providerId,
      user.userId,
      bookingId,
      dto.reason,
      dto.note,
    );
  }
}
