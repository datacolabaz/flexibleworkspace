import { RoleName } from './roles.enum';

/**
 * Module.action permission strings, exactly as enumerated in
 * 33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.4/§33.2 (ADR-011). Deliberately
 * a CODE-LEVEL constant, not an admin-configurable database table — see
 * ADR-011's rationale: "who can grant payment.refund" is a code-review-level
 * decision, not a runtime admin action.
 */
export enum AdminPermission {
  USER_READ = 'user.read',
  USER_UPDATE = 'user.update',
  USER_SUSPEND = 'user.suspend',

  PROVIDER_READ = 'provider.read',
  PROVIDER_UPDATE = 'provider.update',
  PROVIDER_VERIFY = 'provider.verify',
  PROVIDER_SUSPEND = 'provider.suspend',

  LISTING_READ = 'listing.read',
  LISTING_UPDATE = 'listing.update',
  LISTING_PUBLISH = 'listing.publish',
  LISTING_UNPUBLISH = 'listing.unpublish',
  LISTING_ARCHIVE = 'listing.archive',

  BOOKING_READ = 'booking.read',
  BOOKING_CANCEL = 'booking.cancel',
  BOOKING_INVESTIGATE = 'booking.investigate',

  PAYMENT_READ = 'payment.read',
  PAYMENT_REFUND = 'payment.refund',

  PAYOUT_READ = 'payout.read',
  PAYOUT_PROCESS = 'payout.process',

  COMMISSION_READ = 'commission.read',
  COMMISSION_UPDATE = 'commission.update',

  CANCELLATION_POLICY_READ = 'cancellation_policy.read',
  CANCELLATION_POLICY_UPDATE = 'cancellation_policy.update',

  PARTNER_READ = 'partner.read',
  PARTNER_UPDATE = 'partner.update',
  PARTNER_APPROVE = 'partner.approve',

  REVIEW_MODERATE = 'review.moderate',
  REPORT_INVESTIGATE = 'report.investigate',

  TAXONOMY_UPDATE = 'taxonomy.update',
  CMS_UPDATE = 'cms.update',
  SETTINGS_UPDATE = 'settings.update',

  AUDIT_READ = 'audit.read',
}

/**
 * The permission matrix from §33.4. SUPER_ADMIN is not listed explicitly —
 * hasPermission() below short-circuits true for SUPER_ADMIN regardless of
 * this map, matching "tam platforma idarəsi" (full platform control).
 */
export const ROLE_PERMISSIONS: Partial<Record<RoleName, AdminPermission[]>> = {
  [RoleName.OPERATIONS_ADMIN]: [
    AdminPermission.USER_READ,
    AdminPermission.USER_UPDATE,
    AdminPermission.USER_SUSPEND,
    AdminPermission.PROVIDER_READ,
    AdminPermission.PROVIDER_UPDATE,
    AdminPermission.PROVIDER_VERIFY,
    AdminPermission.PROVIDER_SUSPEND,
    AdminPermission.LISTING_READ,
    AdminPermission.LISTING_UPDATE,
    AdminPermission.LISTING_PUBLISH,
    AdminPermission.LISTING_UNPUBLISH,
    AdminPermission.LISTING_ARCHIVE,
    AdminPermission.BOOKING_READ,
    AdminPermission.BOOKING_CANCEL,
    AdminPermission.BOOKING_INVESTIGATE,
    AdminPermission.PAYMENT_READ,
    AdminPermission.PAYOUT_READ,
    AdminPermission.PARTNER_READ,
    AdminPermission.PARTNER_UPDATE,
    AdminPermission.PARTNER_APPROVE,
    AdminPermission.CANCELLATION_POLICY_READ,
    AdminPermission.CANCELLATION_POLICY_UPDATE,
    AdminPermission.AUDIT_READ,
  ],
  [RoleName.FINANCE_ADMIN]: [
    AdminPermission.PROVIDER_READ,
    AdminPermission.BOOKING_READ,
    AdminPermission.PAYMENT_READ,
    AdminPermission.PAYMENT_REFUND,
    AdminPermission.PAYOUT_READ,
    AdminPermission.PAYOUT_PROCESS,
    AdminPermission.COMMISSION_READ,
    AdminPermission.COMMISSION_UPDATE,
    AdminPermission.CANCELLATION_POLICY_READ,
    AdminPermission.PARTNER_READ,
    AdminPermission.AUDIT_READ,
  ],
  [RoleName.CONTENT_ADMIN]: [
    AdminPermission.TAXONOMY_UPDATE,
    AdminPermission.CMS_UPDATE,
    AdminPermission.AUDIT_READ,
  ],
  [RoleName.SUPPORT_ADMIN]: [
    AdminPermission.USER_READ,
    AdminPermission.USER_UPDATE, // narrow allowlist enforced in service layer, §33.1 Q2
    AdminPermission.PROVIDER_READ,
    AdminPermission.LISTING_READ,
    AdminPermission.BOOKING_READ,
    AdminPermission.BOOKING_CANCEL,
    AdminPermission.BOOKING_INVESTIGATE,
    AdminPermission.PAYMENT_READ,
    AdminPermission.PAYMENT_REFUND, // within configured limit — enforced in service layer, 18_SECURITY.md §18.2
    AdminPermission.REVIEW_MODERATE,
    AdminPermission.AUDIT_READ,
  ],
  [RoleName.MODERATION_ADMIN]: [
    AdminPermission.REVIEW_MODERATE,
    AdminPermission.REPORT_INVESTIGATE,
    AdminPermission.AUDIT_READ,
  ],
};

export function hasPermission(
  role: RoleName,
  permission: AdminPermission,
): boolean {
  if (role === RoleName.SUPER_ADMIN) return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
