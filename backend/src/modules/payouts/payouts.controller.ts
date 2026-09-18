import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PayoutsService } from './payouts.service';
import { RunPayoutBatchDto } from './dto/run-payout-batch.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { PayoutReasonDto } from './dto/payout-reason.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { ADMIN_ROLES, RoleName } from '../../common/constants/roles.enum';
import { AdminPermission } from '../../common/constants/admin-permission.enum';
import { PayoutStatus } from '../../common/constants/payout.enum';
import { currentProviderId } from '../../common/utils/current-provider.util';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception';

@ApiTags('Payouts')
@Controller()
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  // --- Provider-facing (14_PAYOUT_LEDGER.md §14.6 dashboard) ---------------

  @Get('providers/me/payout-balance')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({
    summary:
      'My provider revenue/payout balance breakdown (read model — always computed from the ledger, §14.6)',
  })
  async myBalance(@CurrentUser() user: AuthenticatedUser) {
    const providerId = currentProviderId(user);
    if (!providerId) throw new ResourceNotFoundException('Provider');
    return this.payoutsService.getBalance('provider_id', providerId);
  }

  @Get('providers/me/payouts')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({ summary: 'My payout history' })
  async myPayouts(@CurrentUser() user: AuthenticatedUser) {
    const providerId = currentProviderId(user);
    if (!providerId) throw new ResourceNotFoundException('Provider');
    return this.payoutsService.listForProvider(providerId);
  }

  @Get('providers/me/payouts/:id/statement')
  @Roles(RoleName.PROVIDER_OWNER, RoleName.PROVIDER_STAFF)
  @ApiOperation({
    summary: 'Downloadable statement for one of my payouts (§14.5 step 4)',
  })
  async myStatement(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const providerId = currentProviderId(user);
    const { payout, entries } = await this.payoutsService.getStatement(id);
    // Same 404-not-403 ownership discipline used throughout (e.g.
    // PaymentsController.createCheckout) — a provider may only see their
    // own payout statements.
    if (!providerId || payout.providerId !== providerId)
      throw new ResourceNotFoundException('Payout');
    return { payout, entries };
  }

  // --- Admin (14_PAYOUT_LEDGER.md §14.5, 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.4 payout.*) ---

  @Post('admin/payouts/run-batch')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_PROCESS)
  @ApiOperation({
    summary:
      'Run the payout batch job — aggregates every eligible ledger entry into new Payout rows (§14.5 step 1)',
  })
  async runBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RunPayoutBatchDto,
  ) {
    const periodEnd = dto.periodEnd ? new Date(dto.periodEnd) : new Date();
    const periodStart = dto.periodStart
      ? new Date(dto.periodStart)
      : new Date(periodEnd.getTime() - 30 * 24 * 3_600_000);
    return this.payoutsService.runPayoutBatch(
      periodStart,
      periodEnd,
      user.userId,
    );
  }

  @Get('admin/payouts')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_READ)
  @ApiOperation({
    summary:
      'Payouts-to-process queue, optionally filtered by status (§14.5 step 2)',
  })
  async listQueue(@Query('status') status?: PayoutStatus) {
    return this.payoutsService.listQueue(status);
  }

  @Get('admin/payouts/:id/statement')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_READ)
  @ApiOperation({
    summary: 'Ledger entries that make up a given payout (§14.5 step 4)',
  })
  async statement(@Param('id') id: string) {
    return this.payoutsService.getStatement(id);
  }

  @Post('admin/payouts/:id/mark-processing')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_PROCESS)
  @ApiOperation({
    summary:
      'AVAILABLE -> PROCESSING: bank transfer/settlement initiated (§14.3)',
  })
  async markProcessing(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payoutsService.markProcessing(id, user.userId);
  }

  @Post('admin/payouts/:id/mark-paid')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_PROCESS)
  @ApiOperation({
    summary: 'PROCESSING -> PAID, with a bank reference number (§14.5 step 3)',
  })
  async markPaid(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MarkPaidDto,
  ) {
    return this.payoutsService.markPaid(id, user.userId, dto.bankReference);
  }

  @Post('admin/payouts/:id/mark-failed')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_PROCESS)
  @ApiOperation({
    summary: 'PROCESSING -> FAILED: transfer rejected, reason required (§14.3)',
  })
  async markFailed(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PayoutReasonDto,
  ) {
    return this.payoutsService.markFailed(id, user.userId, dto.reason);
  }

  @Post('admin/payouts/:id/retry')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_PROCESS)
  @ApiOperation({
    summary: 'FAILED -> PROCESSING: retry after corrected bank details (§14.3)',
  })
  async retry(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payoutsService.retry(id, user.userId);
  }

  @Post('admin/payouts/:id/reverse')
  @Roles(...ADMIN_ROLES)
  @RequirePermission(AdminPermission.PAYOUT_PROCESS)
  @ApiOperation({
    summary:
      'PAID -> REVERSED: late clawback after settlement, reason required (§14.4.2)',
  })
  async reverse(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PayoutReasonDto,
  ) {
    return this.payoutsService.reverse(id, user.userId, dto.reason);
  }
}
