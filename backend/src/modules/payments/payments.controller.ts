import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { PaymentsService } from './payments.service';
import { RefundsService } from './refunds.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { RequestRefundDto } from './dto/request-refund.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { PaymentAdapterName } from '../../common/constants/payment.enum';
import { ADMIN_ROLES, RoleName } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
  ) {}

  @Public()
  @Post('payments')
  @ApiOperation({
    summary:
      'Create a hosted checkout session (13_PAYMENT_ARCHITECTURE.md §13.3)',
  })
  async createCheckout(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentsService.createCheckoutSession(
      user?.userId ?? null,
      dto,
    );
  }

  @Get('account/payments')
  @ApiOperation({
    summary:
      'My own payment history — every checkout attempt on my bookings, with its transactions and any refund',
  })
  async listMyPayments(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.listForCustomer(user.userId);
  }

  /**
   * Raw body is required to verify the signature byte-for-byte (a
   * JSON-parsed-and-reserialized payload would not reproduce the exact
   * bytes the gateway signed) — see main.ts's `rawBody` bodyParser
   * exception carved out for this path.
   */
  @Public()
  @Post('payments/webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Provider webhook receiver (signature-verified, idempotent — 18_SECURITY.md §18.3)',
  })
  async webhook(
    @Param('provider') provider: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-signature') signatureHeader: string | undefined,
  ) {
    const adapterName = provider.toUpperCase();
    if (
      adapterName !== PaymentAdapterName.EPOINT &&
      adapterName !== PaymentAdapterName.PAYRIFF
    ) {
      throw new BadRequestException(`Unknown payment provider "${provider}".`);
    }
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    await this.paymentsService.handleWebhook(
      adapterName as PaymentAdapterName,
      rawBody,
      signatureHeader,
    );
    return { acknowledged: true };
  }

  @Post('refunds')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Request a refund, computed per cancellation policy (05_USER_FLOWS.md §5.6)',
  })
  async requestRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestRefundDto,
  ) {
    return this.refundsService.requestRefund(user.userId, dto);
  }

  @Post('admin/refunds/:refundId/approve')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYMENT_REFUND)
  @ApiOperation({
    summary:
      'Approve a refund above the Support/Ops authorized limit (18_SECURITY.md §18.2)',
  })
  async approveRefund(
    @Param('refundId') refundId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const adminRole = user.roles.find((r) =>
      (ADMIN_ROLES as string[]).includes(r.role),
    )?.role as RoleName | undefined;
    if (!adminRole)
      throw new ForbiddenException('No admin role found on this account.');
    return this.refundsService.approve(refundId, user.userId, adminRole);
  }
}
