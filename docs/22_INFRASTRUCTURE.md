# 22 — Infrastructure Architecture

## 22.1 LOW COST MVP ARCHITECTURE (V1 — what actually gets built)

```
                         ┌──────────────────────┐
                         │   Cloudflare (free)   │  CDN + DNS + basic WAF/DDoS
                         └──────────┬────────────┘
                                    │
                     ┌──────────────┴───────────────┐
                     │   Web/App server (1 node)     │  Modular monolith
                     │   Node.js/TypeScript (NestJS   │  (all domain modules,
                     │   or similar) — Render/Railway │   see 22.4, in one deployable)
                     │   /Fly.io or a Hetzner/DO VPS  │
                     └──────────────┬────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
    ┌─────────▼─────────┐ ┌─────────▼─────────┐ ┌─────────▼─────────┐
    │ Managed PostgreSQL │ │  Redis (single,    │ │ Object storage     │
    │ (+ PostGIS)         │ │  small instance)   │ │ (Cloudflare R2 or  │
    │ Supabase/Neon/      │ │  job queue + cache  │ │ Backblaze B2)      │
    │ Render/DO Managed   │ │                     │ │ — photos, zero-    │
    └────────────────────┘ └────────────────────┘ │ egress via CDN     │
                                                     └────────────────────┘
    External: Google Maps Platform · Epoint/Payriff (payment) · Email provider (SES/Resend)
              · Local AZ SMS aggregator · Sentry (error monitoring)
```

**Explicitly not present in V1:** Kubernetes, a service mesh, microservices, Kafka/a dedicated event bus, Elasticsearch/OpenSearch, a multi-database polyglot layer, a dedicated Redis cluster. Every one of these solves a scale or organizational problem (many independent teams, huge data volume, complex event choreography across many services) that a single-team, pre-liquidity marketplace does not have yet — including any of them now would be spending the "low infra cost" budget on capabilities nobody is using.

## 22.2 Compute & Hosting Decision

**Recommendation: start on a managed PaaS (Render or Railway) rather than a raw VPS**, accepting a slightly higher $/month at tiny scale in exchange for zero ops overhead (managed TLS, zero-downtime deploys, log aggregation, easy horizontal scaling later) — for a small team without dedicated DevOps capacity, engineer *time* saved is worth more than the marginal $10–20/month a VPS might save at this stage. A VPS (Hetzner/DigitalOcean) remains a valid, cheaper fallback if operational capacity to manage it exists — captured as an explicit trade-off in `27_ADRS.md`, not a unilateral decision this document forces.

## 22.3 Database

Managed PostgreSQL from day one (not self-hosted on the app server) — automated backups/PITR are worth paying for immediately in a payments-bearing product; this is one of the few places where "managed" is worth its modest premium over "cheapest possible," because a lost or corrupted booking/payment database is catastrophic in a way that justifies the cost (`23_COST_MODEL.md` for exact figures). A single primary instance is sufficient at V1 traffic; a read replica is a scale-triggered addition (22.6), not built now.

## 22.4 Modular Monolith Structure

```
/src
  /modules
    auth/          users/        providers/      locations/
    rooms/         search/       availability/   bookings/
    payments/      payouts/      reviews/        notifications/
    admin/         analytics/
  /shared           (cross-cutting: db client, event bus (in-process), i18n, config)
```

Each module owns its own data-access logic and exposes a narrow internal interface to other modules (e.g. `bookings` calls `payments.createCheckoutSession()`, not the payment module's database tables directly) — this internal-boundary discipline is what makes **extracting a module into its own service later a refactor, not a rewrite**, if/when a specific module's load genuinely outgrows the monolith (see `26_ROADMAP.md`/`27_ADRS.md` for the concrete trigger conditions, e.g. `search` or `notifications` are the most plausible first candidates for extraction since they have the most distinct scaling/latency profiles from the rest of the system).

## 22.5 Background Jobs — Only Where Actually Needed

A single small job queue (Redis-backed, e.g. BullMQ, reusing the same Redis instance as the cache — not a second Redis deployment) handles exactly the jobs that must not block a request: hold-expiry sweep, auto-complete sweep, reminder sweep (`12_RESERVATION_ENGINE.md`), notification sending (`17_NOTIFICATION_ARCHITECTURE.md`), image resize/thumbnail generation (22.7), and payout-batch aggregation (`14_PAYOUT_LEDGER.md`). This is a lightweight queue on top of infrastructure already being paid for — not a dedicated message-broker service (Kafka/RabbitMQ), which would again be solving a throughput/fan-out problem this system doesn't have at V1 volume.

## 22.6 SCALE-UP ARCHITECTURE (named explicitly, not built now)

Trigger-based, not calendar-based — each upgrade happens when its specific trigger condition is actually met:

| Trigger | Scale-up move |
|---|---|
| DB read load measurably contends with write load | Add a read replica; route search/analytics reads to it |
| Search latency degrades past target with growing catalog | Introduce a dedicated search engine (Meilisearch/Typesense as a lighter option, or Elasticsearch/OpenSearch) — `16_SEARCH_ARCHITECTURE.md` §16.1 |
| A specific module (e.g. `notifications`, `search`) has a distinct load/scaling profile from the rest | Extract that module into its own service behind the same internal interface it already had — `27_ADRS.md` |
| Job queue throughput/latency becomes a bottleneck | Dedicated Redis instance for queue, separate from cache Redis |
| Multi-region/multi-market traffic (Georgia/Turkey/EU expansion) | Regional deployment + CDN edge optimization; database strategy revisited (single global DB vs. regional read replicas) per data-residency requirements of the new market |
| Sustained high concurrent write load on bookings | Application-level connection pooling (e.g. PgBouncer) before considering DB sharding — sharding is a last resort, not an early move |

## 22.7 Media Pipeline

Uploaded photos are processed through a resize/compress pipeline (generating a small set of standard sizes — thumbnail, card, full-detail — and modern formats WebP/AVIF with a JPEG fallback for older clients) before being written to object storage; originals are not served directly to end users. This runs as a background job (22.5) triggered on upload, keeping the upload request itself fast.

## 22.8 Monitoring

Error monitoring (Sentry — free tier sufficient at V1 volume, `23_COST_MODEL.md`) wired in from the first deployment, not added later — catching a production bug on day 3 instead of when a user complains is a near-zero-cost win. Basic uptime monitoring (many free/near-free options) on the public site and API. Structured application logs shipped to the PaaS provider's built-in log aggregation (avoiding a separate logging-stack cost at V1).

## 22.9 Environments

`development → staging → production`, with staging as a lower-spec mirror of production infrastructure (not a full-scale replica) used for QA and safe testing of migrations/payment-webhook integrations against provider sandbox environments (both Epoint and Payriff document sandbox/test modes) before anything touches real money.
