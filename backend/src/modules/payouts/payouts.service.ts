import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { PayoutEntity } from './entities/payout.entity';
import { LedgerEntryEntity } from '../payments/entities/ledger-entry.entity';
import { LedgerEntryType } from '../../common/constants/payment.enum';
import { ProviderEntity } from '../providers/entities/provider.entity';
import { AppUserEntity } from '../auth/entities/app-user.entity';
import { PartnerEntity } from '../partners/entities/partner.entity';
import {
  PAYEE_LEDGER_ENTRY_TYPES,
  PAYOUT_TRANSITIONS,
  PayoutStatus,
} from '../../common/constants/payout.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit/audit-log.service';
import {
  DomainException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception';

type PayeeColumn = 'provider_id' | 'partner_id';

interface EligibleLedgerRow {
  id: string;
  amount: string;
  currency: string;
  entry_type: string;
}

export interface PayeeBalance {
  available: number; // eligible now, not yet batched into a payout
  pending: number; // owed but still inside the booking's cancellation window
  inTransit: number; // batched into a payout that is AVAILABLE or PROCESSING
  paid: number; // batched into a payout that is PAID
  currency: string;
}

/**
 * 14_PAYOUT_LEDGER.md — the scheduled/admin-triggered batch job (§14.5),
 * the PENDING->AVAILABLE->PROCESSING->PAID/FAILED/REVERSED lifecycle
 * (§14.3), refund clawback handling (§14.4), and the read-model balance
 * view (§14.6). Generic over provider/partner payees from the start
 * (§14.5a: "reuses this exact lifecycle... keyed by partner_id instead of
 * provider_id") — the Partner entity itself doesn't exist yet (P4-3a is
 * still pending), but the ledger already writes PARTNER_COMMISSION entries
 * with partner_id (ADR-010, wired in CommissionService), and every query
 * here operates on that raw column, so partner payouts work correctly the
 * moment P4-3a starts writing referral attributions — no changes needed here.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PayoutEntity)
    private readonly payoutRepo: Repository<PayoutEntity>,
    @InjectRepository(LedgerEntryEntity)
    private readonly ledgerRepo: Repository<LedgerEntryEntity>,
    @InjectRepository(ProviderEntity)
    private readonly providerRepo: Repository<ProviderEntity>,
    @InjectRepository(AppUserEntity)
    private readonly appUserRepo: Repository<AppUserEntity>,
    @InjectRepository(PartnerEntity)
    private readonly partnerRepo: Repository<PartnerEntity>,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * The one eligibility rule, expressed once and reused everywhere it's
   * needed (batch discovery, batching, and the balance read-model), so the
   * "is this booking's money safe to pay out yet" business rule can never
   * drift between call sites. §14.3: a booking's PROVIDER_NET/
   * PARTNER_COMMISSION only becomes payable once its cancellation window has
   * closed (or it reached a terminal, no-longer-refundable state).
   * REFUND/ADJUSTMENT rows are only ever written once a booking has already
   * resolved to CANCELLED/REFUNDED, so they're always eligible the moment
   * they exist. `free_until_hours ?? 24` mirrors RefundsService's identical
   * platform-wide default (05_USER_FLOWS.md §5.6 — no fixed value in any
   * approved doc, same REQUIRES USER ACTION note applies).
   */
  private eligibleNowSql(): string {
    return `(
      b.status IN ('COMPLETED','CANCELLED','REFUNDED','NO_SHOW')
      OR (
        b.status = 'CONFIRMED'
        AND item_room.start_at IS NOT NULL
        AND now() >= item_room.start_at - (COALESCE((item_room.cancellation_policy->>'free_until_hours')::numeric, 24) || ' hours')::interval
      )
    )`;
  }

  private baseJoinSql(column: PayeeColumn): string {
    return `
      FROM ledger_entry le
      JOIN booking b ON b.id = le.booking_id
      LEFT JOIN LATERAL (
        SELECT bi.start_at, r.cancellation_policy
        FROM booking_item bi JOIN room r ON r.id = bi.room_id
        WHERE bi.booking_id = b.id
        ORDER BY bi.start_at ASC LIMIT 1
      ) item_room ON true
      WHERE le.${column} = $1
        AND le.entry_type IN (${PAYEE_LEDGER_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})
    `;
  }

  /** Every distinct payee (of the given kind) that currently has at least one eligible, unbatched entry — the batch job's discovery step. */
  private async listEligiblePayeeIds(column: PayeeColumn): Promise<string[]> {
    const rows = await this.dataSource.query(`
      SELECT DISTINCT le.${column} AS payee_id
      FROM ledger_entry le
      JOIN booking b ON b.id = le.booking_id
      LEFT JOIN LATERAL (
        SELECT bi.start_at, r.cancellation_policy
        FROM booking_item bi JOIN room r ON r.id = bi.room_id
        WHERE bi.booking_id = b.id
        ORDER BY bi.start_at ASC LIMIT 1
      ) item_room ON true
      WHERE le.${column} IS NOT NULL
        AND le.entry_type IN (${PAYEE_LEDGER_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})
        AND le.payout_id IS NULL
        AND ${this.eligibleNowSql()}
    `);
    return rows.map((r: any) => r.payee_id);
  }

  private async findEligibleEntriesForPayee(
    manager: EntityManager,
    column: PayeeColumn,
    payeeId: string,
    lock: boolean,
  ): Promise<EligibleLedgerRow[]> {
    return manager.query(
      `SELECT le.id, le.amount, le.currency, le.entry_type
       ${this.baseJoinSql(column)}
         AND le.payout_id IS NULL
         AND ${this.eligibleNowSql()}
       ${lock ? 'FOR UPDATE OF le' : ''}`,
      [payeeId],
    );
  }

  /**
   * §14.5 step 1 — "Scheduled job... aggregates all AVAILABLE LedgerEntry
   * rows per provider into a Payout record." Runs one isolated transaction
   * per payee so one payee's failure doesn't block the rest of the batch.
   * A payee whose net eligible balance is zero or negative is simply left
   * unbatched (payout_id stays NULL) — its entries carry forward into the
   * next run, which is exactly §14.4's "negative balance carried forward"
   * clawback mechanism, generalized to apply automatically rather than as a
   * special case.
   */
  async runPayoutBatch(
    periodStart: Date,
    periodEnd: Date,
    initiatedByUserId: string | null,
  ): Promise<PayoutEntity[]> {
    const created: PayoutEntity[] = [];
    for (const column of ['provider_id', 'partner_id'] as PayeeColumn[]) {
      const payeeIds = await this.listEligiblePayeeIds(column);
      for (const payeeId of payeeIds) {
        try {
          const payout = await this.batchOnePayee(
            column,
            payeeId,
            periodStart,
            periodEnd,
            initiatedByUserId,
          );
          if (payout) created.push(payout);
        } catch (err) {
          this.logger.error(
            `Payout batching failed for ${column}=${payeeId}: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }
    }
    return created;
  }

  private async batchOnePayee(
    column: PayeeColumn,
    payeeId: string,
    periodStart: Date,
    periodEnd: Date,
    initiatedByUserId: string | null,
  ): Promise<PayoutEntity | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const entries = await this.findEligibleEntriesForPayee(
        queryRunner.manager,
        column,
        payeeId,
        true,
      );
      if (entries.length === 0) {
        await queryRunner.rollbackTransaction();
        return null;
      }

      const amount = entries.reduce((sum, e) => sum + Number(e.amount), 0);
      const minPayoutAmount =
        this.configService.get<number>('payout.minPayoutAmountMinorUnits') ?? 0;
      if (amount <= minPayoutAmount) {
        // Net balance isn't (meaningfully) positive — leave every entry
        // unbatched. Covers both "genuinely nothing owed yet" and the
        // refund-clawback case (§14.4.2) in one code path.
        await queryRunner.rollbackTransaction();
        return null;
      }

      const grossLedgerTotal = entries
        .filter(
          (e) =>
            e.entry_type === 'PROVIDER_NET' ||
            e.entry_type === 'PARTNER_COMMISSION',
        )
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const payout = queryRunner.manager.create(PayoutEntity, {
        providerId: column === 'provider_id' ? payeeId : null,
        partnerId: column === 'partner_id' ? payeeId : null,
        periodStart,
        periodEnd,
        grossLedgerTotal: String(grossLedgerTotal),
        amount: String(amount),
        currency: entries[0].currency,
        status: PayoutStatus.AVAILABLE, // §14.5 step 1: created directly AVAILABLE, eligibility already checked at the entry level
        initiatedByUserId,
        createdAt: new Date(),
      });
      const saved = await queryRunner.manager.save(payout);

      await queryRunner.manager.update(
        LedgerEntryEntity,
        { id: In(entries.map((e) => e.id)) },
        { payoutId: saved.id },
      );

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /** §14.6 — provider/partner dashboard "Revenue"/"Payouts" read model: always computed by summing LedgerEntry rows, never an independently maintained balance field. */
  async getBalance(
    column: PayeeColumn,
    payeeId: string,
  ): Promise<PayeeBalance> {
    const [row] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(le.amount) FILTER (WHERE le.payout_id IS NULL AND ${this.eligibleNowSql()}), 0) AS available,
         COALESCE(SUM(le.amount) FILTER (WHERE le.payout_id IS NULL AND NOT ${this.eligibleNowSql()}), 0) AS pending,
         COALESCE(SUM(le.amount) FILTER (WHERE p.status IN ('AVAILABLE','PROCESSING')), 0) AS in_transit,
         COALESCE(SUM(le.amount) FILTER (WHERE p.status = 'PAID'), 0) AS paid,
         MAX(le.currency) AS currency
       FROM ledger_entry le
       JOIN booking b ON b.id = le.booking_id
       LEFT JOIN LATERAL (
         SELECT bi.start_at, r.cancellation_policy
         FROM booking_item bi JOIN room r ON r.id = bi.room_id
         WHERE bi.booking_id = b.id
         ORDER BY bi.start_at ASC LIMIT 1
       ) item_room ON true
       LEFT JOIN payout p ON p.id = le.payout_id
       WHERE le.${column} = $1
         AND le.entry_type IN (${PAYEE_LEDGER_ENTRY_TYPES.map((t) => `'${t}'`).join(',')})`,
      [payeeId],
    );
    return {
      available: Number(row?.available ?? 0),
      pending: Number(row?.pending ?? 0),
      inTransit: Number(row?.in_transit ?? 0),
      paid: Number(row?.paid ?? 0),
      currency: row?.currency ?? 'AZN',
    };
  }

  /** §14.5 step 2 — the admin panel "Payouts to process" queue. */
  async listQueue(status?: PayoutStatus): Promise<PayoutEntity[]> {
    return this.payoutRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async listForProvider(providerId: string): Promise<PayoutEntity[]> {
    return this.payoutRepo.find({
      where: { providerId },
      order: { createdAt: 'DESC' },
    });
  }

  /** §14.5 step 4 — "a downloadable statement showing exactly which bookings/ledger entries make up that payout." */
  async getStatement(
    payoutId: string,
  ): Promise<{ payout: PayoutEntity; entries: LedgerEntryEntity[] }> {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new ResourceNotFoundException('Payout');
    const entries = await this.ledgerRepo.find({
      where: { payoutId },
      order: { createdAt: 'ASC' },
    });
    return { payout, entries };
  }

  private async transition(
    payoutId: string,
    to: PayoutStatus,
  ): Promise<PayoutEntity> {
    const payout = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!payout) throw new ResourceNotFoundException('Payout');
    const allowed = PAYOUT_TRANSITIONS[payout.status] ?? [];
    if (!allowed.includes(to)) {
      throw new DomainException(
        'INVALID_PAYOUT_STATE_TRANSITION',
        `Cannot move payout from ${payout.status} to ${to}.`,
        HttpStatus.CONFLICT,
      );
    }
    payout.status = to;
    return this.payoutRepo.save(payout);
  }

  /** §14.5 step 3 — admin/finance marks the bank transfer as initiated. */
  async markProcessing(
    payoutId: string,
    adminUserId: string,
  ): Promise<PayoutEntity> {
    const before = await this.payoutRepo.findOne({ where: { id: payoutId } });
    const updated = await this.transition(payoutId, PayoutStatus.PROCESSING);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Payout',
      entityId: payoutId,
      action: 'MARK_PROCESSING',
      beforeState: { status: before?.status },
      afterState: { status: updated.status },
    });
    return updated;
  }

  /** §14.5 step 3/4 — bank transfer confirmed; notifies the provider with the statement. */
  async markPaid(
    payoutId: string,
    adminUserId: string,
    bankReference: string,
  ): Promise<PayoutEntity> {
    const before = await this.payoutRepo.findOne({ where: { id: payoutId } });
    let updated = await this.transition(payoutId, PayoutStatus.PAID);
    updated.bankReference = bankReference;
    updated.paidAt = new Date();
    updated = await this.payoutRepo.save(updated);

    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Payout',
      entityId: payoutId,
      action: 'MARK_PAID',
      beforeState: { status: before?.status },
      afterState: {
        status: updated.status,
        bankReference: updated.bankReference,
        paidAt: updated.paidAt,
      },
    });

    if (updated.providerId) {
      await this.notifyProviderPaid(updated);
    } else if (updated.partnerId) {
      await this.notifyPartnerPaid(updated);
    }

    return updated;
  }

  private async notifyProviderPaid(payout: PayoutEntity): Promise<void> {
    if (!payout.providerId) return;
    const provider = await this.providerRepo.findOne({
      where: { id: payout.providerId },
    });
    if (!provider) return;
    const owner = await this.appUserRepo.findOne({
      where: { id: provider.ownerUserId },
    });
    const recipient = owner?.email || owner?.phone;
    if (!owner || !recipient) return;

    const amountDisplay = (Number(payout.amount) / 100).toFixed(2);
    await this.notificationsService.send({
      userId: owner.id,
      channel: NotificationsService.isEmail(recipient) ? 'EMAIL' : 'SMS',
      templateKey: 'payout.paid',
      locale: owner.locale || 'az',
      recipient,
      subject: 'FlexSpace — Ödənişiniz göndərildi',
      body: `<p>${amountDisplay} ${payout.currency} məbləğində ödənişiniz göndərildi (ref: ${payout.bankReference}).</p>`,
      payload: {
        payoutId: payout.id,
        amount: payout.amount,
        currency: payout.currency,
      },
    });
  }

  /**
   * §14.5a — the partner-side equivalent of notifyProviderPaid.
   *
   * `notification.user_id` is `NOT NULL REFERENCES app_user(id)`
   * (28_DATABASE_DDL.sql §10) — a real FK, not just a TypeORM-level
   * convention — and `Partner.ownerUserId` is a RESERVED, nullable
   * forward-compat column that no V1 partner ever has set (§31.7: no
   * self-service partner portal/login exists yet, so nothing ever creates
   * that app_user row). Sending through NotificationsService.send() for a
   * partner with no linked app_user would therefore violate that FK on
   * every real V1 partner, not just an edge case — so this deliberately
   * no-ops until a partner has an owner account, rather than fabricating a
   * user_id or bypassing the notification table (which would silently lose
   * the "did the user actually get this" delivery record §17.5 exists
   * for). Until the self-service portal ships, ops notifies partners of a
   * completed payout out-of-band (the admin payout statement, §14.5 step 4,
   * already shows everything needed) — see PHASE4_REPORT.md.
   */
  private async notifyPartnerPaid(payout: PayoutEntity): Promise<void> {
    if (!payout.partnerId) return;
    const partner = await this.partnerRepo.findOne({
      where: { id: payout.partnerId },
    });
    if (!partner?.ownerUserId) {
      this.logger.log(
        `Payout ${payout.id} paid for partner ${payout.partnerId} — no linked owner account yet, skipping in-app notification (see PHASE4_REPORT.md).`,
      );
      return;
    }
    const recipient = partner.contactEmail || partner.contactPhone;
    if (!recipient) return;

    const amountDisplay = (Number(payout.amount) / 100).toFixed(2);
    await this.notificationsService.send({
      userId: partner.ownerUserId,
      channel: NotificationsService.isEmail(recipient) ? 'EMAIL' : 'SMS',
      templateKey: 'payout.paid',
      locale: 'az',
      recipient,
      subject: 'Partner ödənişiniz göndərildi',
      body: `<p>${amountDisplay} ${payout.currency} məbləğində partner komissiya ödənişiniz göndərildi (ref: ${payout.bankReference}).</p>`,
      payload: {
        payoutId: payout.id,
        amount: payout.amount,
        currency: payout.currency,
      },
    });
  }

  /** §14.3 FAILED — "Transfer failed... provider notified, corrected details required before retry." */
  async markFailed(
    payoutId: string,
    adminUserId: string,
    reason: string,
  ): Promise<PayoutEntity> {
    const before = await this.payoutRepo.findOne({ where: { id: payoutId } });
    const updated = await this.transition(payoutId, PayoutStatus.FAILED);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Payout',
      entityId: payoutId,
      action: 'MARK_FAILED',
      beforeState: { status: before?.status },
      afterState: { status: updated.status },
      reason,
    });
    return updated;
  }

  /** §14.3 — "retry -> PROCESSING." */
  async retry(payoutId: string, adminUserId: string): Promise<PayoutEntity> {
    const before = await this.payoutRepo.findOne({ where: { id: payoutId } });
    const updated = await this.transition(payoutId, PayoutStatus.PROCESSING);
    await this.auditLogService.recordChange({
      actorUserId: adminUserId,
      entityType: 'Payout',
      entityId: payoutId,
      action: 'RETRY',
      beforeState: { status: before?.status },
      afterState: { status: updated.status },
    });
    return updated;
  }

  /**
   * §14.4.2 — "A payout already marked PAID had to be clawed back... the
   * adjustment entry creates a negative balance carried forward against
   * that provider's next payout, rather than attempting an actual bank
   * clawback." Writes one new offsetting ADJUSTMENT ledger entry PER
   * original entry the payout batched (payout_id left NULL on each, so
   * together they roll into the payee's next batch) rather than a single
   * lump-sum entry — every ledger row must reference the specific booking
   * it belongs to (14_PAYOUT_LEDGER.md §14.1's "every AZN traceable from a
   * specific booking to a specific payout"), and a payout typically
   * aggregates many bookings, so a one-line reversal would either violate
   * that traceability or need to invent a booking it doesn't belong to.
   * Mirrors RefundsService's per-booking, append-only reversal discipline.
   */
  async reverse(
    payoutId: string,
    adminUserId: string,
    reason: string,
  ): Promise<PayoutEntity> {
    const before = await this.payoutRepo.findOne({ where: { id: payoutId } });
    if (!before) throw new ResourceNotFoundException('Payout');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const allowed = PAYOUT_TRANSITIONS[before.status] ?? [];
      if (!allowed.includes(PayoutStatus.REVERSED)) {
        throw new DomainException(
          'INVALID_PAYOUT_STATE_TRANSITION',
          `Cannot reverse a payout in status ${before.status}.`,
          HttpStatus.CONFLICT,
        );
      }
      const updated = await queryRunner.manager.findOne(PayoutEntity, {
        where: { id: payoutId },
      });
      if (!updated) throw new ResourceNotFoundException('Payout');
      updated.status = PayoutStatus.REVERSED;
      await queryRunner.manager.save(updated);

      const originalEntries: {
        id: string;
        booking_id: string;
        amount: string;
        currency: string;
      }[] = await queryRunner.manager.query(
        `SELECT id, booking_id, amount, currency FROM ledger_entry WHERE payout_id = $1`,
        [payoutId],
      );
      if (originalEntries.length === 0) {
        throw new DomainException(
          'PAYOUT_HAS_NO_ENTRIES',
          'Cannot reverse a payout with no linked ledger entries.',
          HttpStatus.CONFLICT,
        );
      }
      const clawbackEntries = originalEntries.map((e) => {
        const entry = new LedgerEntryEntity();
        entry.bookingId = e.booking_id;
        entry.providerId = updated.providerId;
        entry.partnerId = updated.partnerId;
        entry.entryType = LedgerEntryType.ADJUSTMENT;
        entry.amount = String(-Number(e.amount));
        entry.currency = e.currency;
        entry.payoutId = null;
        entry.createdAt = new Date();
        return entry;
      });
      await queryRunner.manager.save(LedgerEntryEntity, clawbackEntries);

      await queryRunner.commitTransaction();

      await this.auditLogService.recordChange({
        actorUserId: adminUserId,
        entityType: 'Payout',
        entityId: payoutId,
        action: 'REVERSE',
        beforeState: { status: before.status },
        afterState: { status: updated.status },
        reason,
      });

      return updated;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
