# 04 — Personas

## 4.1 Customer Personas

### P1 — "Elvin," the Freelance Consultant (Coworking/Private Office)
Baku-based independent contractor working for foreign clients. Needs a professional desk or small office a few days a week, sometimes a private room for a client video call. Price-sensitive, mobile-first, books last-minute (same day/next day). **Primary jobs-to-be-done:** find a desk near his apartment/metro right now; avoid monthly-membership lock-in.

### P2 — "Günel," the Corporate Trainer / Tutor
Runs professional-certification and language courses. Needs a classroom or training room for 2–4 hour blocks, recurring weekly, for 8–20 participants, with a projector/whiteboard. Books ahead (days to weeks), price-conscious but values reliability over lowest price — a cancelled room mid-course-series is a reputational disaster for her. **Primary JTBD:** guaranteed room availability for a recurring schedule; clear cancellation/rescheduling policy.

### P3 — "Nigar," the SME Office Manager
Works at a small company (10–30 people) without a leased boardroom. Books meeting/interview rooms for client meetings, hiring interviews, and occasional team workshops. Books on behalf of others, needs a receipt/invoice for company expense reporting. **Primary JTBD:** fast, professional-looking room close to her office, with an invoice she can submit to accounting.

### P4 — "Tural," the Content Creator
Runs a growing podcast/YouTube channel. Needs an hourly podcast or photo/video studio with specific equipment (lighting, soundproofing, backdrop). Currently has almost no dedicated marketplace to search this category in AZ. **Primary JTBD:** filter by equipment/specs, not just room type.

## 4.2 Provider Personas

### P5 — "Rəşad," the Independent Coworking Owner
Owns one coworking location in Baku (Nizami or Narimanov district) with 1–3 bookable room types plus desks. Not technical; manages bookings via phone/Instagram today. Wants more bookings without hiring staff or learning complex software. **Primary JTBD:** simple calendar, doesn't want to pay a big monthly fee before he sees bookings — this is why the FREE tier exists (`25_PROVIDER_ARCHITECTURE.md`).

### P6 — "ABC Business Centre," the Multi-Location Operator
Manages 2+ locations (e.g. Baku + Ganja) each with multiple room types, has administrative staff who need their own logins scoped to their location. Wants analytics on occupancy and revenue, and calendar tools to block time for maintenance/private events. **Primary JTBD:** manage multiple locations and staff from one dashboard; this persona is the anchor use case for the `Provider → Location → Room` hierarchy and `ProviderStaff` role.

### P7 — "Kapital Training Centre," the Education Operator
Operates classrooms/training rooms as their core business (not a coworking space with rooms as a side offering). Cares heavily about recurring-booking reliability (V2) and needs verification/trust badges to reassure corporate clients booking multi-week course rentals.

## 4.3 Platform-Side Personas

### P8 — Platform Admin
Anthropic... (n/a) — internal FlexSpace staff responsible for provider verification, dispute resolution, financial oversight, platform configuration (commission rules, featured placement, promotions). Needs full audit-trail visibility for anything touching money (`18_SECURITY.md`, `24_ADMIN_ARCHITECTURE.md`).

### P9 — Support/Operations
Front-line staff handling booking disputes, refund requests, provider onboarding assistance, and customer complaints. Needs read access to bookings/payments (not raw payment credentials) and the ability to action refunds within defined limits, escalating anything above a threshold to Platform Admin.

## 4.4 How Personas Map to Roles

| Persona | Role (see `09_DOMAIN_MODEL.md`) |
|---|---|
| P1–P4 (customers) | `Customer` |
| P5, P7 (single-location owner) | `Provider` (Business Owner) |
| P6 (multi-location) | `Provider` (Business Owner) + multiple `ProviderStaff` |
| P8 | `Platform Admin` |
| P9 | `Support/Operations` |

Corporate personas (a company employee booking against a shared budget) are explicitly deferred — noted here only so `09_DOMAIN_MODEL.md`'s `Company/Employee/Team` extension points are traceable back to a real future persona, not invented speculatively.
