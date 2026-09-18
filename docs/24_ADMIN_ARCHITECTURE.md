# 24 — Admin Architecture

## 24.1 Admin Module Scope

Users · Providers · Locations · Rooms · Bookings · Payments · Refunds · Payouts · Reviews · Reports · Disputes · Promotions · Subscriptions · Featured Listings · Verification · Audit Logs · Analytics — per `06_INFORMATION_ARCHITECTURE.md` §6.3 site map, grouped functionally: **Marketplace** (providers/locations/rooms/bookings), **Finance** (payments/refunds/payouts), **Trust & Safety** (reviews/verification/disputes), **Growth** (promotions/subscriptions/featured), **System** (audit logs/analytics).

## 24.2 Provider Verification Workflow

```
Provider submits profile + first location/room → status: PENDING
    → Admin reviews: business legitimacy (registration info, contact verification),
      location/room photos for authenticity, policy compliance
    → VERIFIED (verified badge granted, listing becomes publicly searchable)
    → or REJECTED (reason recorded, provider notified, can resubmit after fixing issues)
    → VERIFIED providers can later be SUSPENDED (policy violation, fraud signal, repeated
      customer complaints) — reversible back to VERIFIED after remediation
```

Every transition writes a `ProviderVerificationEvent` (`09_DOMAIN_MODEL.md`) — the full history of a provider's verification status is preserved, not overwritten, so "why did this provider lose their badge and when did they get it back" is always answerable to a disputing party or a future audit.

**Verified badge is admin-granted only** — never self-declared or automatically granted purely by completing signup fields — this is the core trust mechanism the whole "LOCAL + TRUSTED" positioning (`00_RECOMMENDED_FINAL_ARCHITECTURE.md`) depends on.

## 24.3 Dispute Resolution Workflow

A `Dispute` (customer vs. provider disagreement — e.g. "the room didn't match the listing," "provider no-showed") is raised from either a booking detail page (customer) or the provider dashboard, routed to Support/Operations with read access to the relevant booking/payment/messages (if any), with escalation to Platform Admin for anything involving a refund above the Support tier's authorized limit (`18_SECURITY.md` §18.2). Resolution outcome (refund issued / partial refund / no action / provider warning) is recorded and feeds back into the provider's internal trust score, which is **not** publicly shown but factors into `24.2`'s suspension decisions.

## 24.4 Financial Admin Actions

- **Refund approval**: Support/Ops can approve within a configured limit; above that, Platform Admin approval required — every approval writes to `AuditLog` (`18_SECURITY.md` §18.5).
- **Payout processing**: the payout batch queue (`14_PAYOUT_LEDGER.md` §14.5) is reviewed and executed by Finance/Admin staff — marking a payout `PAID` requires entering the actual bank transfer reference, not just a checkbox, so the audit trail ties back to a real transaction.
- **Commission rule management**: setting/overriding a provider's commission percentage, creating promotional/category-specific commission rules (`13_PAYMENT_ARCHITECTURE.md` §13.5) — restricted to Platform Admin, fully audited.

## 24.5 Promotions, Subscriptions, Featured Listings Management

Admin can create/manage: time-boxed promotional commission rates for provider cohorts (e.g. "first 20 verified providers get 8% commission for 6 months" — `26_ROADMAP.md` liquidity strategy), customer-facing coupon codes, provider subscription plan assignments and overrides (`25_PROVIDER_ARCHITECTURE.md`), and featured-listing slot allocation (which rooms appear in the homepage "Featured spaces" section — sold as a plan benefit or a one-off paid placement, config-driven, not hardcoded to specific room IDs in application code).

## 24.6 Reporting

Standard operational reports (bookings/revenue/commission over time, provider growth, verification funnel, top-performing categories/cities) built as read-only views/queries against the operational database and analytics events (`21_ANALYTICS.md`) — no separate BI tool license needed at V1 scale; a dedicated BI/warehouse layer is a scale-triggered addition, consistent with `22_INFRASTRUCTURE.md`'s general philosophy.

## 24.7 Audit Log Visibility

`/admin/audit-logs` is searchable by entity type/ID, actor, and date range — the practical interface to the append-only `AuditLog` table (`09_DOMAIN_MODEL.md`, `18_SECURITY.md` §18.5). This is treated as a first-class admin feature, not an afterthought debugging tool, because it's the concrete answer to "how do we prove what happened" for any financial dispute, regulatory question, or internal investigation.

## 24.8 Admin Access Control

Admin/Support accounts are provisioned by existing Platform Admins only (no public admin signup surface), mandatory 2FA (`11_API_CONTRACTS.md` §11.4), and role-scoped even within the admin surface (a Support/Ops account cannot access `/admin/audit-logs` financial-rule-change entries or modify commission rules — only Platform Admin can) — the admin panel has its own internal RBAC tiering, it is not "one admin role that can do everything."

**This tiering is now fully designed, not just stated:** `33_ADMIN_OPERATIONAL_CONTROL_CENTER.md` (ADR-011) turns the sentence above into six concrete roles and a module.action permission matrix, plus a mandatory reason+audit+revert mechanism (§33.5–§33.7) for every admin correction — the Admin panel is treated as the platform's operational control center from V1, per that document's governing principle, not an afterthought CRUD surface.
