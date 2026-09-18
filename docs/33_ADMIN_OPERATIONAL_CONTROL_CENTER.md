# 33 — Admin Operational Control Center: Review & Architecture Extension

**Status:** Architecture review completed per explicit request, before any Admin-module implementation beyond what already existed (Provider verification, `ProviderVerificationEvent`, the append-only `audit_log` table — all approved in Phase 0–2). This document is additive to `09_DOMAIN_MODEL.md`, `10_DATABASE_SCHEMA.md`, `11_API_CONTRACTS.md`, `18_SECURITY.md`, and `24_ADMIN_ARCHITECTURE.md` — pointer notes added to each. **One real conflict is identified and resolved in §33.3** — read that before assuming this is purely additive. Formal decision recorded as ADR-011 (`27_ADRS.md`).

**Governing principle, taken from the request and elevated to a standing V1 requirement:** the admin panel is not a CRUD dashboard bolted onto the marketplace after launch — it is how a platform operator safely corrects the mistakes real users and providers will make (wrong price, wrong capacity, wrong status, a booking that needs investigating), without ever touching the database directly and without ever bypassing the business rules, authorization, or financial integrity that already govern the rest of the system. "Admin can fix it" and "admin can silently overwrite financial state" are different claims — this document is mostly about keeping them different.

## 33.1 Answering the 12 Review Questions

**1. Which entities already exist for admin to act on?**
`Provider`, `ProviderStaff`, `Location`, `Room` (+`RoomType`, `Amenity`, `Photo`, `AvailabilityRule`, `BlockedPeriod`), `AppUser`, `Booking`/`BookingItem`, `Payment`/`PaymentTransaction`/`Refund`, `LedgerEntry`/`Payout`, `CommissionRule`, `Review`, `Promotion`/`Coupon`, `Subscription`, `ProviderVerificationEvent`, `AuditLog`, and (added just before this) `Partner`/`ReferralCampaign`. Nothing in this request needs a wholly new domain concept — it needs a **permission layer, an audit upgrade, and a correction/revert mechanism** wrapped around what already exists.

**2. Which entities can admin edit, and 3. which need special permission?** See the permission matrix in §33.4 — every module.action pair the request listed is mapped to one of the six roles from §33.2. As a summary: read access is broad (`OPERATIONS_ADMIN`/`SUPPORT_ADMIN`/`FINANCE_ADMIN`/`MODERATION_ADMIN` can each read the data their job needs); the write actions the request calls "High-Risk" (§33.5) are the ones gated tighter than ordinary field edits.

**4. Which must remain immutable?** `LedgerEntry` (already append-only, enforced at the DB grant level per `14_PAYOUT_LEDGER.md`), `AuditLog` itself (already append-only, no UPDATE/DELETE grant — `18_SECURITY.md` §18.5), `PaymentTransaction` history, `ProviderVerificationEvent` history. Admin corrects the *current* state of a `Provider`/`Room`/`Booking`, never rewrites what the ledger or audit trail already recorded as having happened.

**5. Which operations require audit?** Every admin write to `Provider`, `Room`, `Location`, `AppUser`, `CommissionRule`, `Partner`/`ReferralCampaign`, plus every High-Risk action in §33.5 — enforced structurally (§33.6), not left to each controller to remember.

**6. Which are financial-integrity-linked?** Anything touching `Booking.status`, `Payment`/`Refund`, `Payout`, or `CommissionRule` — the concrete rule requested ("admin cannot fake a payment by writing `status = CONFIRMED`") is enforced by construction: admin refund/cancellation/payout actions call the **same domain services** (`BookingsService`, the future `PaymentsService`/`PayoutsService`) that the customer/provider/webhook paths call, never a raw repository update. An admin controller is a second caller of the existing state machine, not a bypass of it.

**7. Which need soft delete?** Already true for `AppUser`, `Provider`, `Location`, `Room` (`deleted_at`, `10_DATABASE_SCHEMA.md` §10.6); `Partner` already added it (§31.2). `Review` is the one gap — it currently has `moderation_status` but no `deleted_at`; §33.3 adds it. `ReferralCampaign` doesn't need one — its `ACTIVE|PAUSED|ENDED` status already serves the same purpose.

**8. Which data should be revertible?** Any field captured in an `audit_log` row with a real `before_state` — in practice, `Room` (price, capacity, amenities, description, cancellation policy, min/max duration — everything in the request's example list), `Provider` (commission override, plan tier), `Location` (address/coordinates). This is built as one generic mechanism (§33.7), not a bespoke "revert" implementation per entity.

**9. Which admin roles are needed?** Six, exactly as requested — see §33.2 for how they map onto the existing `role_name` enum.

**10. Which API endpoints are needed?** Extensions to the already-existing `/admin/*` surface: per-module admin edit endpoints for `Room`/`Location` (bypassing the ownership check that gates the provider-facing endpoints, since admin legitimately acts across providers), `POST /admin/audit-logs/{id}/revert`, `GET /admin/search?q=` (global search), plus the already-planned `/admin/partners*` (§31.6). Full list in §33.8.

**11. Which database/audit/revision tables are needed?** None new — `audit_log` already has the right shape (`before_state`/`after_state` JSONB, actor, entity, timestamp) and needs two additive columns (`reason`, `reverted_audit_log_id`) rather than a new table. See §33.3.

**12. Which Phase 0–3 documents need changes?** `09_DOMAIN_MODEL.md` (Role, AuditLog), `10_DATABASE_SCHEMA.md` (the two `audit_log` columns), `11_API_CONTRACTS.md` (new endpoints, `reason` on admin mutations), `18_SECURITY.md` (the permission matrix replaces the three bullet points in §18.2's RBAC section with something enforceable), `24_ADMIN_ARCHITECTURE.md` (§24.8's "internal RBAC tiering" was promised but never actually designed — this document is that design). Pointer notes added to each; `27_ADRS.md` gets ADR-011.

## 33.2 Six Admin Roles, Not Two — Mapped Onto the Existing Enum

**The conflict:** `role_name` (`28_DATABASE_DDL.sql`) currently has exactly two internal-staff values, `PLATFORM_ADMIN` and `SUPPORT_OPS`, matching the five-role model the original brief specified. The request now names six distinct admin roles (`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `CONTENT_ADMIN`, `SUPPORT_ADMIN`, `MODERATION_ADMIN`) with module-level permission granularity. `24_ADMIN_ARCHITECTURE.md` §24.8 already *said* "the admin panel has its own internal RBAC tiering, it is not one admin role that can do everything" — but never built the mechanism, so this isn't a reversal of an existing decision, it's finishing one that was left as a named gap.

**Resolution:**
- `role_name` is extended via two `ALTER TYPE ... RENAME VALUE` operations (no data rewrite, existing rows keep their meaning) — `PLATFORM_ADMIN → SUPER_ADMIN` and `SUPPORT_OPS → SUPPORT_ADMIN` — plus four new additive values: `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `CONTENT_ADMIN`, `MODERATION_ADMIN`. `CUSTOMER`, `PROVIDER_OWNER`, `PROVIDER_STAFF` are untouched.
- **Permission granularity is a code-level constant map, not a new admin-configurable database table.** `AdminPermission` strings (`listing.read`, `booking.refund`, etc., exactly as the request enumerated) are declared once in code as a `Record<AdminRole, Set<Permission>>` and enforced by a `@RequirePermission()` decorator + guard layered on top of the existing `RolesGuard` — the same guard-composition pattern already used for `JwtAuthGuard → RolesGuard` (`app.module.ts`). This is a deliberate, named choice, not a shortcut: an admin-editable permissions table would itself be an unrestricted-power surface of exactly the kind §33's own governing principle (and the request's §20) warns against — "who can grant `payment.refund` to whom" is a decision serious enough to belong in code review, not a runtime admin action. If a real need for dynamic permission assignment emerges later, it attaches additively (a `role_permission` override table consulted before the code default) without touching this structure.
- `SUPER_ADMIN` implicitly holds every permission (the request's "tam platforma idarəsi") rather than needing every permission string listed out — a single `hasPermission()` check short-circuits true for `SUPER_ADMIN`.

## 33.3 Database Changes (the only schema conflict; everything else is additive-only)

Two nullable columns added to the already-approved `audit_log` table:
- `reason TEXT` — nullable (not every audit event has a human-supplied reason — e.g. an automated status transition — but every *admin-initiated* correction is required, at the application layer, to supply one; enforced in code, not by a `NOT NULL` constraint, since the same table also logs non-admin system events).
- `reverted_audit_log_id UUID REFERENCES audit_log(id)` — nullable, set when this row **is itself** a revert of an earlier entry (§33.7), so the audit trail shows both directions of a correction without ever mutating the original row.

One nullable column added to `review`: `deleted_at TIMESTAMPTZ` — closing the one real soft-delete gap found in §33.1 Q7.

`role_name` enum changes per §33.2 (two renames, four additive values) — renames are metadata-only in Postgres (`ALTER TYPE ... RENAME VALUE`), not a data migration; existing `PLATFORM_ADMIN`/`SUPPORT_OPS` role assignments continue to resolve correctly under their new names.

No other table changes. `LedgerEntry`, `Payment`, `Booking` keep their exact approved shape — financial integrity (Q6) is enforced by *which code path* is allowed to write to them, not by a schema change.

## 33.4 Permission Matrix (V1)

| Permission | SUPER_ADMIN | OPERATIONS_ADMIN | FINANCE_ADMIN | CONTENT_ADMIN | SUPPORT_ADMIN | MODERATION_ADMIN |
|---|---|---|---|---|---|---|
| `user.read` / `user.update` / `user.suspend` | ✅ | ✅ | — | — | ✅ (update limited to a narrow field allowlist, §33.1 Q2) | — |
| `provider.read` / `provider.update` / `provider.verify` / `provider.suspend` | ✅ | ✅ | read-only | — | read-only | — |
| `listing.read` / `.update` / `.publish` / `.unpublish` / `.archive` | ✅ | ✅ | — | — | read-only | — |
| `booking.read` / `.cancel` / `.investigate` | ✅ | ✅ | read-only | — | ✅ | — |
| `payment.read` / `.refund` | ✅ | read-only | ✅ | — | refund within configured limit (`18_SECURITY.md` §18.2, unchanged) | — |
| `payout.read` / `.process` | ✅ | read-only | ✅ | — | — | — |
| `commission.read` / `.update` | ✅ | — | ✅ | — | — | — |
| `partner.read` / `.update` / `.approve` | ✅ | ✅ | read-only (earnings) | — | — | — |
| `review.moderate` / `report.investigate` | ✅ | — | — | — | read-only | ✅ |
| `taxonomy.update` (room categories, amenities) | ✅ | — | — | ✅ | — | — |
| `cms.update` (homepage, banners, FAQ, SEO) | ✅ | — | — | ✅ | — | — |
| `settings.update` (commission default, booking limits) | ✅ | — | — | — | — | — |
| `audit.read` | ✅ | ✅ (own module's entities) | ✅ (own module's entities) | ✅ (own module's entities) | ✅ (own module's entities) | ✅ (own module's entities) |

This is the code-level `ROLE_PERMISSIONS` map from §33.2 — the table above is its documentation, not a separate source of truth.

## 33.5 High-Risk Actions (Explicit Confirm-and-Execute, Always Audited)

Refund, payout execution, commission-rule change, provider suspension, account deactivation, permanent content deletion, any direct financial-ledger adjustment, and manual booking-status intervention are never a plain "save" button. Each requires: the caller to hold the specific permission (§33.4, backend-enforced — a hidden frontend button is never treated as access control, per the request's §20), a non-empty `reason`, an `AuditLog` write in the same transaction as the effect, and idempotency on the ones that move money (already designed into the payment/payout domain — `10_DATABASE_SCHEMA.md` §10.7, `14_PAYOUT_LEDGER.md`). A second-level (dual-control) approval step is named as a real V2 enhancement, not built in V1 — flagged explicitly rather than silently promised, since it needs a second admin identity/workflow this document doesn't yet design.

## 33.6 AdminAuditService — the One Path Every Admin Write Goes Through

A single injectable service, `AdminAuditService.recordChange(actorUserId, action, entityType, entityId, beforeState, afterState, reason, ipAddress)`, called by every admin controller/service method that mutates state — never `AuditLog` written ad hoc per-controller. This is what makes Q5 ("which operations require audit") a structural guarantee rather than a per-endpoint discipline question: a new admin endpoint that mutates state and forgets to call this service is a code-review-catchable omission (one call, one place), not a silent gap.

## 33.7 Correction / Recovery: Generic Revert, Not a Per-Entity Feature

`POST /admin/audit-logs/{id}/revert` reads the target `audit_log` row's `before_state`, re-applies it through the **same domain service method** that produced the original change (e.g. a Room price revert calls `RoomsService.update()` with the old price, not a raw UPDATE), and writes a **new** `audit_log` row with `reverted_audit_log_id` pointing at the entry being reverted. Reverting is therefore itself an audited, business-rule-checked write — not a special unaudited "undo" path — which is exactly what the request's own example (`[Revert]` → "Revert özü də ayrıca audit event yaratmalıdır") asked for.

## 33.8 New/Extended API Surface (additive to `29_API_OPENAPI.yaml`)

```
PATCH /admin/users/{id}                     Edit an allowlisted field subset; suspend/reactivate
GET   /admin/rooms/{roomId}                 Admin view of any room, any provider
PATCH /admin/rooms/{roomId}                 Admin edit (price/capacity/amenities/description/policy/etc.), reason required
PATCH /admin/rooms/{roomId}/status          Admin publish/unpublish/archive/restore
PATCH /admin/locations/{locationId}         Admin edit (address/coordinates/etc.), reason required
GET   /admin/audit-logs                     Extended filters: entityType, entityId, actorUserId, action, from, to
POST  /admin/audit-logs/{id}/revert         §33.7
GET   /admin/search?q=                      Cross-entity lookup (booking ref, provider email, room name -> related entities, §18/§19 of the request)
```

`VerifyProviderDto`'s existing `notes` field already satisfies "reason" for provider verification/suspension (§31's `VerifyProviderDto`/`setSuspended` — no change needed there beyond ensuring it's always passed through to `AdminAuditService`).

## 33.9 V1 Scope Discipline — What This Does NOT Build Now

Consistent with every other V1 scope cut in this project (Partner §31.7, plan tiers §25.2): **not** built in this pass — a full CMS content-management UI (homepage/banners/FAQ content model is named here but its editor is a later frontend milestone), admin-configurable dynamic permissions (§33.2's explicit reasoning), bulk actions, dual-control/second-approver workflow, a dedicated global-search index (V1's search is a direct-lookup query across a handful of tables, not a search-engine-backed omnisearch), and CMS/system-settings persistence beyond the `commission_rule`/config values that already exist. These are named so they're visibly deferred, not silently dropped — each attaches additively to the `AdminAuditService`/permission-matrix foundation built here.
