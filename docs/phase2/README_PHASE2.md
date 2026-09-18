# Phase 2 — Database + API Contracts

This folder is the concrete, executable implementation of the decisions fixed in Phase 1 (`10_DATABASE_SCHEMA.md` and `11_API_CONTRACTS.md`). No application/business logic code has been written — this is schema and contract only, per the approved phase gate:

```
PHASE 0 — Product Discovery   ✅
PHASE 1 — Architecture         ✅
PHASE 2 — Database + API Contracts   ✅ (this folder)
        ↓
   [USER APPROVAL — next gate]
        ↓
PHASE 3 — UX/UI Design
PHASE 4 — Implementation
...
```

## Contents

| File | What it is | Traces back to |
|---|---|---|
| `28_DATABASE_DDL.sql` | Full PostgreSQL schema: ~28 tables, all enums, indexes, foreign keys, and — critically — the exclusion constraint that makes double-booking physically impossible at the database level | `09_DOMAIN_MODEL.md`, `10_DATABASE_SCHEMA.md` |
| `29_API_OPENAPI.yaml` | Full OpenAPI 3.0 contract for public/customer, provider, and admin endpoints, including auth, error envelope, and idempotency handling | `11_API_CONTRACTS.md` |
| `30_SEED_DATA.sql` | Room-type taxonomy (14 categories), amenity taxonomy, AZ holiday calendar (illustrative — verify before production), default commission rule | `01_PRODUCT_REQUIREMENTS.md` §1.3, `13_PAYMENT_ARCHITECTURE.md` §13.5 |

## What to review before approving Phase 3

1. **The exclusion constraint in `28_DATABASE_DDL.sql`** (search for `no_overlapping_bookings`) — this is the single most important line in the whole schema. Confirm it matches your understanding of "never double-book."
2. **The `commission_rule` default (12%)** in `30_SEED_DATA.sql` — this is a business decision placeholder within the 10–15% range recommended in `00_RECOMMENDED_FINAL_ARCHITECTURE.md` §9, not an engineering constant. Confirm or change before this ever runs against real money.
3. **The holiday calendar dates** — marked illustrative; verify against an official AZ government source, and note religious holidays (lunar calendar) are deliberately not hardcoded.
4. **The OpenAPI endpoint list** — confirm nothing you need is missing before Phase 4 implementation starts against this contract; adding an endpoint later is easy, but a frontend team building against a moving contract is not.

## What this does NOT include (by design — later phases)

- Actual row-level security policies / application-role GRANT statements (a Phase 4 implementation detail, though the append-only intent for `ledger_entry` and `audit_log` is noted in comments)
- Migration versioning setup (tool choice pending `27_ADRS.md` ADR-009)
- Frontend types generated from the OpenAPI spec (a Phase 4 build step)
- Any seed data beyond reference/taxonomy data — no test fixtures, no fake bookings
