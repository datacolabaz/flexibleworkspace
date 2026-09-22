import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { RefundEntity } from './entities/refund.entity';
import { AdminCancellationPolicySettingEntity } from '../admin/entities/admin-cancellation-policy-setting.entity';
import { LedgerEntryEntity } from './entities/ledger-entry.entity';
import { PaymentEntity } from './entities/payment.entity';
import { PaymentTransactionEntity } from './entities/payment-transaction.entity';
import { RequestRefundDto } from './dto/request-refund.dto';
import { EpointPaymentProvider } from './providers/epoint.provider';
import { PayriffPaymentProvider } from './providers/payriff.provider';
import { PaymentProvider } from './providers/payment-provider.interface';
import {
  LedgerEntryType,
  PaymentAdapterName,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  RefundStatus,
} from '../../common/constants/payment.enum';
import { BookingsService } from '../bookings/bookings.service';
import { BookingEntity } from '../bookings/entities/booking.entity';
import { BookingStatus } from '../../common/constants/booking.enum';
import { RoleName } from '../../common/constants/roles.enum';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

interface CancellationPolicy {
  free_until_hours?: number;
  partial_refund_pct?: number;
}

/**
 * 14_PAYOUT_LEDGER.md §14.4 (refund/cancellation ledger correctness) +
 * 05_USER_FLOWS.md §5.6 (customer cancellation) + 18_SECURITY.md §18.2
 * (tiered refund-approval authority) + ADR-010 (partner commission
 * reversal, §31.3).
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(RefundEntity)
    private readonly refundRepo: Repository<RefundEntity>,
    @InjectRepository(BookingEntity)
    private readonly bookingRepo: Repository<BookingEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(AdminCancellationPolicySettingEntity)
    private readonly cancellationPolicySettingRepo: Repository<AdminCancellationPolicySettingEntity>,
    private readonly configService: ConfigService,
    private readonly bookingsService: BookingsService,
    private readonly auditLogService: AuditLogService,
    private readonly epointProvider: EpointPaymentProvider,
    private readonly payriffProvider: PayriffPaymentProvider,
  ) {}

  private resolveProvider(name: PaymentAdapterName): PaymentProvider {
    return name === PaymentAdapterName.EPOINT
      ? this.epointProvider
      : this.payriffProvider;
  }

  /**
   * §5.6: "the applicable refund amount is computed live from the room's
   * CancellationPolicy and how far out the booking start time is." A room
   * that never set its own policy falls back to the admin-configurable
   * platform default (`admin_cancellation_policy_setting`,
   * AdminCancellationPolicyController — 25_PROVIDER_ARCHITECTURE.md /
   * Sprint 2) instead of a hardcoded value — seeded at 24h/0% so behavior
   * is unchanged until an admin edits it.
   */
  private async platformDefaultPolicy(): Promise<Required<CancellationPolicy>> {
    const setting = await this.cancellationPolicySettingRepo.findOne({
      where: { settingKey: 'platform_default' },
    });
    return {
      free_until_hours: setting ? Number(setting.freeUntilHours) : 24,
      partial_refund_pct:
        setting?.partialRefundPct != null
          ? Number(setting.partialRefundPct)
          : 0,
    };
  }

  private async computeRefundPercentage(
    policy: CancellationPolicy | null,
    hoursUntilStart: number,
  ): Promise<number> {
    const fallback = await this.platformDefaultPolicy();
    const freeUntilHours =
      policy?.free_until_hours ?? fallback.free_until_hours;
    if (hoursUntilStart >= freeUntilHours) return 100;
    if (policy?.partial_refund_pct != null) return policy.partial_refund_pct;
    return fallback.partial_refund_pct;
  }

  /** Customer self-service cancellation (§5.6) — the refund amount is deterministic, computed from a pre-published policy, not a staff judgment call, so no approval step is needed here (distinct from RefundsService.approve, which is for staff-actioned refunds — dispute handling, goodwill, etc.). */
  async requestRefund(
    customerUserId: string,
    dto: RequestRefundDto,
  ): Promise<RefundEntity> {
    const booking = await this.bookingRepo.findOne({
      where: { id: dto.bookingId },
      relations: ['items'],
    });
    if (!booking || booking.deletedAt)
      throw new ResourceNotFoundException('Booking');
    if (booking.customerUserId !== customerUserId)
      throw new ResourceNotFoundException('Booking');
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new DomainException(
        'BOOKING_NOT_CANCELLABLE',
        `Booking is ${booking.status} and cannot be cancelled.`,
        HttpStatus.CONFLICT,
      );
    }

    const item = booking.items?.[0];
    if (!item) throw new ResourceNotFoundException('Booking item');
    const [room] = await this.dataSource.query(
      `SELECT cancellation_policy FROM room WHERE id = $1`,
      [item.roomId],
    );
    const policy: CancellationPolicy | null = room?.cancellation_policy ?? null;

    const hoursUntilStart = (item.startAt.getTime() - Date.now()) / 3_600_000;
    const refundPct = await this.computeRefundPercentage(
      policy,
      hoursUntilStart,
    );
    const refundAmount = Math.round(
      Number(booking.totalAmount) * (refundPct / 100),
    );

    const payment = await this.paymentRepo.findOne({
      where: { bookingId: booking.id, status: PaymentStatus.CAPTURED },
    });
    if (!payment) {
      throw new DomainException(
        'NO_CAPTURED_PAYMENT',
        'No captured payment found for this booking.',
        HttpStatus.CONFLICT,
      );
    }

    const now = new Date();
    let refund = this.refundRepo.create({
      bookingId: booking.id,
      paymentTransactionId: null,
      amount: String(refundAmount),
      currency: booking.currency,
      reason: dto.reason,
      status: RefundStatus.REQUESTED,
      requestedByUserId: customerUserId,
      createdAt: now,
      updatedAt: now,
    });
    refund = await this.refundRepo.save(refund);

    const autoApproveLimit =
      this.configService.get<number>('refund.autoApproveLimitMinorUnits') ?? 0;
    if (refundAmount <= autoApproveLimit) {
      // §18.2's threshold model applied to the self-service path too:
      // within the configured limit, no human needs to act.
      refund = await this.processApprovedRefund(
        refund,
        payment.providerAdapter,
        null,
      );
    } else {
      // Above the auto-approve limit — booking is cancelled immediately
      // (the customer's cancellation itself isn't in question) but the
      // actual money movement waits for staff approval via /admin/refunds/{id}/approve.
      await this.bookingsService.transition(
        booking.id,
        BookingStatus.CANCELLED,
      );
    }

    return refund;
  }

  /**
   * Staff-actioned approval (18_SECURITY.md §18.2's tiered authority /
   * the user's Admin Panel spec §9 "Admin → Confirm → Execute" high-risk
   * flow). SUPPORT_ADMIN may only approve within the configured limit;
   * FINANCE_ADMIN/SUPER_ADMIN may approve any amount — enforced here, not
   * just by the permission guard, since @RequirePermission(PAYMENT_REFUND)
   * alone can't express the amount-based tier.
   */
  async approve(
    refundId: string,
    adminUserId: string,
    adminRole: RoleName,
  ): Promise<RefundEntity> {
    const refund = await this.refundRepo.findOne({ where: { id: refundId } });
    if (!refund) throw new ResourceNotFoundException('Refund');
    if (refund.status !== RefundStatus.REQUESTED) {
      throw new DomainException(
        'REFUND_NOT_PENDING',
        `Refund is already ${refund.status}.`,
        HttpStatus.CONFLICT,
      );
    }

    const limit =
      this.configService.get<number>('refund.autoApproveLimitMinorUnits') ?? 0;
    const isTierUnlimited =
      adminRole === RoleName.SUPER_ADMIN ||
      adminRole === RoleName.FINANCE_ADMIN;
    if (!isTierUnlimited && Number(refund.amount) > limit) {
      throw new DomainException(
        'ESCALATION_REQUIRED',
        'This refund amount exceeds your authorized limit and requires Finance/Super Admin approval.',
        HttpStatus.FORBIDDEN,
      );
    }

    const payment = await this.paymentRepo.findOne({
      where: { bookingId: refund.bookingId },
      order: { createdAt: 'DESC' },
    });
    if (!payment) throw new ResourceNotFoundException('Payment');

    const before = {
      status: refund.status,
      approvedByUserId: refund.approvedByUserId,
    };
    const processed = await this.processApprovedRefund(
      refund,
      payment.providerAdapter,
      adminUserId,
    );

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Refund',
      entityId: refund.id,
      action: 'APPROVE',
      beforeState: before,
      afterState: {
        status: processed.status,
        approvedByUserId: processed.approvedByUserId,
      },
      reason: `Refund approved (${adminRole}).`,
    });

    return processed;
  }

  /**
   * The actual money-movement + ledger-correctness step (§14.4), shared by
   * the auto-approve path and the staff-approve path. Runs in one
   * transaction: Refund status, Payment/PaymentTransaction rows, booking
   * cancellation state machine, and every reversing LedgerEntry.
   */
  private async processApprovedRefund(
    refund: RefundEntity,
    providerAdapter: PaymentAdapterName,
    approvedByUserId: string | null,
  ): Promise<RefundEntity> {
    const provider = this.resolveProvider(providerAdapter);
    const payment = await this.paymentRepo.findOne({
      where: {
        bookingId: refund.bookingId,
        providerAdapter,
        status: PaymentStatus.CAPTURED,
      },
    });
    if (!payment || !payment.externalReference) {
      throw new DomainException(
        'PAYMENT_NOT_CAPTURED',
        'No captured payment to refund.',
        HttpStatus.CONFLICT,
      );
    }

    const refundAmount = Number(refund.amount);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      refund.status = RefundStatus.APPROVED;
      refund.approvedByUserId = approvedByUserId;
      refund.updatedAt = new Date();
      await queryRunner.manager.save(refund);

      const booking = await queryRunner.manager.findOne(BookingEntity, {
        where: { id: refund.bookingId },
      });
      if (!booking) throw new ResourceNotFoundException('Booking');

      // §14.4: proportional reversal of every component originally written
      // at confirmation — GROSS, PLATFORM_FEE, PROCESSING_FEE, PROVIDER_NET,
      // and PARTNER_COMMISSION if present — so a full refund nets every
      // component to exactly zero and a partial refund reverses only its share.
      const originals = await queryRunner.manager.query(
        `SELECT entry_type, amount, provider_id, partner_id FROM ledger_entry
         WHERE booking_id = $1 AND entry_type IN ('GROSS','PLATFORM_FEE','PROCESSING_FEE','PROVIDER_NET','PARTNER_COMMISSION')`,
        [refund.bookingId],
      );
      const by = (type: string) =>
        originals.find((r: any) => r.entry_type === type);
      const grossOriginal = Number(by('GROSS')?.amount ?? booking.totalAmount);
      const reversalRatio =
        grossOriginal > 0 ? refundAmount / grossOriginal : 0;
      const providerId =
        by('PROVIDER_NET')?.provider_id ?? by('GROSS')?.provider_id;

      const now = new Date();
      const newEntries: LedgerEntryEntity[] = [];
      const mk = (
        entryType: LedgerEntryType,
        amount: number,
        payee: { providerId?: string | null; partnerId?: string | null },
      ) => {
        const e = new LedgerEntryEntity();
        e.bookingId = refund.bookingId;
        e.providerId = payee.providerId ?? null;
        e.partnerId = payee.partnerId ?? null;
        e.entryType = entryType;
        e.amount = String(Math.round(amount));
        e.currency = refund.currency;
        e.createdAt = now;
        return e;
      };

      newEntries.push(
        mk(LedgerEntryType.REFUND, -refundAmount, { providerId }),
      );
      const platformFeeOriginal = by('PLATFORM_FEE');
      if (platformFeeOriginal)
        newEntries.push(
          mk(
            LedgerEntryType.ADJUSTMENT,
            Math.abs(Number(platformFeeOriginal.amount)) * reversalRatio,
            { providerId },
          ),
        );
      const processingFeeOriginal = by('PROCESSING_FEE');
      if (processingFeeOriginal)
        newEntries.push(
          mk(
            LedgerEntryType.ADJUSTMENT,
            Math.abs(Number(processingFeeOriginal.amount)) * reversalRatio,
            { providerId },
          ),
        );
      const providerNetOriginal = by('PROVIDER_NET');
      if (providerNetOriginal)
        newEntries.push(
          mk(
            LedgerEntryType.ADJUSTMENT,
            -Number(providerNetOriginal.amount) * reversalRatio,
            { providerId },
          ),
        );
      const partnerCommissionOriginal = by('PARTNER_COMMISSION');
      if (partnerCommissionOriginal) {
        // §31.3: "An offsetting REFUND-type partner ledger entry is written" — explicitly REFUND, not ADJUSTMENT, per that document's own wording.
        newEntries.push(
          mk(
            LedgerEntryType.REFUND,
            -Number(partnerCommissionOriginal.amount) * reversalRatio,
            { partnerId: partnerCommissionOriginal.partner_id },
          ),
        );
      }
      await queryRunner.manager.save(LedgerEntryEntity, newEntries);

      // Booking state machine: CONFIRMED -> CANCELLED -> (REFUND_PENDING -> REFUNDED if money is actually moving).
      if (booking.status === BookingStatus.CONFIRMED) {
        await this.bookingsService.transition(
          booking.id,
          BookingStatus.CANCELLED,
          queryRunner.manager,
        );
      }
      if (refundAmount > 0) {
        await this.bookingsService.transition(
          booking.id,
          BookingStatus.REFUND_PENDING,
          queryRunner.manager,
        );
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    if (refundAmount === 0) {
      refund.status = RefundStatus.COMPLETED;
      refund.updatedAt = new Date();
      return this.refundRepo.save(refund);
    }

    // The gateway call happens OUTSIDE the DB transaction (an external HTTP
    // call must never hold a DB transaction open) — if it fails, the refund
    // stays PROCESSING (money-movement-in-flight, safe: never silently
    // marked complete) rather than rolling back a booking cancellation that
    // has already correctly happened from the customer's point of view.
    refund.status = RefundStatus.PROCESSING;
    await this.refundRepo.save(refund);

    try {
      const result = await provider.refund(
        payment.externalReference,
        refundAmount,
        refund.currency,
      );
      const transaction = this.dataSource
        .getRepository(PaymentTransactionEntity)
        .create({
          paymentId: payment.id,
          type: PaymentTransactionType.REFUND,
          amount: String(refundAmount),
          currency: refund.currency,
          status: result.success
            ? PaymentTransactionStatus.CAPTURED
            : PaymentTransactionStatus.FAILED,
          externalReference: result.externalReference,
          webhookReceivedAt: null,
          createdAt: new Date(),
        });
      await this.dataSource
        .getRepository(PaymentTransactionEntity)
        .save(transaction);

      if (result.success) {
        refund.status = RefundStatus.COMPLETED;
        await this.bookingsService.transition(
          refund.bookingId,
          BookingStatus.REFUNDED,
        );
        payment.status = PaymentStatus.REFUNDED;
        await this.paymentRepo.save(payment);
      }
    } catch (err) {
      this.logger.error(
        `Gateway refund call failed for refund ${refund.id}: ${(err as Error).message}`,
      );
      // Stays PROCESSING — REQUIRES manual reconciliation (visible in the
      // admin Refunds queue) rather than being silently marked failed or
      // complete on an unconfirmed gateway outcome.
    }
    refund.updatedAt = new Date();
    return this.refundRepo.save(refund);
  }
}
