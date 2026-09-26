import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PromoCodeEntity, PromoDiscountType } from './entities/promo-code.entity';
import { ReferralEntity, ReferralStatus } from './entities/referral.entity';
import { DomainException } from '../../common/exceptions/domain.exception';

/**
 * Task 4 — PromoService handles promo code validation/application and
 * referral lifecycle management.
 *
 * Promo codes are validated server-side only — the discount amount is
 * computed here and never trusted from the client. BookingService calls
 * validatePromoCode() before calculating the final booking total, and
 * applyPromoToBooking() after the booking row is created.
 *
 * Referrals are created at signup time (recordReferral) and qualified
 * after a confirmed non-cancelled booking (qualifyReferral). Reward
 * disbursement (→ REWARDED) is an admin-triggered operation, not
 * implemented in this migration pass.
 */
@Injectable()
export class PromoService {
  constructor(
    @InjectRepository(PromoCodeEntity)
    private readonly promoRepo: Repository<PromoCodeEntity>,
    @InjectRepository(ReferralEntity)
    private readonly referralRepo: Repository<ReferralEntity>,
  ) {}

  // ── Promo codes ──────────────────────────────────────────────────────────

  /**
   * Validates a promo code and returns the discount amount (in minor units)
   * for the given booking total. Throws if the code is invalid or exhausted.
   *
   * @param code        - The code string entered by the customer.
   * @param bookingAmount - The booking subtotal in minor units (before discount).
   * @returns           The discount to subtract from the booking total (always ≥ 0,
   *                    capped to bookingAmount so total never goes negative).
   */
  async validatePromoCode(
    code: string,
    bookingAmount: number,
  ): Promise<{ promoCodeId: string; discountAmount: number }> {
    const promo = await this.promoRepo.findOne({
      where: { code: code.toUpperCase().trim() },
    });

    if (!promo || !promo.isActive) {
      throw new DomainException(
        'PROMO_CODE_INVALID',
        'Bu promosyon kodu mövcud deyil.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    if (promo.validFrom > now) {
      throw new DomainException(
        'PROMO_CODE_INVALID',
        'Bu promosyon kodu hələ aktiv deyil.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (promo.validUntil && promo.validUntil < now) {
      throw new DomainException(
        'PROMO_CODE_EXPIRED',
        'Bu promosyon kodunun müddəti bitib.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
      throw new DomainException(
        'PROMO_CODE_EXHAUSTED',
        'Bu promosyon kodunun istifadə limiti dolub.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let discountAmount: number;
    if (promo.discountType === PromoDiscountType.PERCENT) {
      // discountValue is in basis points (10000 = 100 %)
      discountAmount = Math.round((bookingAmount * promo.discountValue) / 10_000);
    } else {
      // discountValue is in minor units
      discountAmount = promo.discountValue;
    }

    // Cap the discount so the total never goes below zero.
    discountAmount = Math.min(discountAmount, bookingAmount);

    return { promoCodeId: promo.id, discountAmount };
  }

  /**
   * Records that a promo code was used for a booking: increments the
   * uses_count counter. Call this AFTER the booking is successfully created.
   *
   * @param promoCodeId - The promo code's UUID (from validatePromoCode).
   */
  async applyPromoToBooking(promoCodeId: string): Promise<void> {
    await this.promoRepo.increment({ id: promoCodeId }, 'usesCount', 1);
    await this.promoRepo.update({ id: promoCodeId }, { updatedAt: new Date() });
  }

  // ── Referrals ────────────────────────────────────────────────────────────

  /**
   * Creates a referral record when a new user signs up via a referral link.
   * Silently no-ops if the referred user is already in the table (UNIQUE
   * constraint on referred_user_id — a user can only be referred once).
   *
   * @param referrerId  - The existing user who shared the referral link.
   * @param referredId  - The newly-signed-up user.
   * @param source      - Optional UTM/attribution tag.
   * @returns           The created ReferralEntity, or null if the user was
   *                    already referred (no-op path).
   */
  async recordReferral(
    referrerId: string,
    referredId: string,
    source?: string | null,
  ): Promise<ReferralEntity | null> {
    // Guard: a user cannot refer themselves.
    if (referrerId === referredId) return null;

    const existing = await this.referralRepo.findOne({
      where: { referredUserId: referredId },
    });
    if (existing) return null; // already referred, no-op

    const now = new Date();
    const referral = this.referralRepo.create({
      referrerUserId: referrerId,
      referredUserId: referredId,
      source: source ?? null,
      status: ReferralStatus.PENDING,
      rewardAmount: null,
      bookingId: null,
      createdAt: now,
      updatedAt: now,
    });
    return this.referralRepo.save(referral);
  }

  /**
   * Marks a referral as QUALIFIED when the referred user completes
   * their first non-cancelled booking.
   *
   * @param referralId  - The referral record to qualify.
   * @param bookingId   - The qualifying booking UUID.
   */
  async qualifyReferral(referralId: string, bookingId: string): Promise<void> {
    const referral = await this.referralRepo.findOne({ where: { id: referralId } });
    if (!referral || referral.status !== ReferralStatus.PENDING) return;

    await this.referralRepo.update(referralId, {
      status: ReferralStatus.QUALIFIED,
      bookingId,
      updatedAt: new Date(),
    });
  }

  /**
   * Finds the pending referral for a user (if any) — used by BookingService
   * to automatically qualify referrals on first confirmed booking.
   */
  async findPendingReferral(referredUserId: string): Promise<ReferralEntity | null> {
    return this.referralRepo.findOne({
      where: { referredUserId, status: ReferralStatus.PENDING },
    });
  }
}
