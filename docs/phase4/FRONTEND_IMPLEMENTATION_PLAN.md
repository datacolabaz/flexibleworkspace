# P4-9/P4-10 — Frontend Implementation Plan

**Status:** PLAN FOR REVIEW — no application code written yet, per explicit instruction. This document is the output of steps 1–5 (repo inspection, architecture/ADR read, design-token/brand read) and the implementation plan requested for step 6. Nothing below has been built.

**Scope note:** Spotva brand identity (logo, color, typography) is approved and closed — not reopened anywhere in this document. Tagline and mission/vision remain deferred and do not block anything here; nothing in frontend implementation depends on them.

---

## 1. Repository inspection — current state

- **No frontend exists.** `find` across the repo for `frontend`/`web`/`client`/`app` directories returns nothing. `backend/` (NestJS) is the only application code.
- **Repo shape:** `/home/claude/flexspace/` is a single git repository (root `.git/`) containing `backend/`, `docs/`, and `docker-compose.yml` as siblings. `backend/` is not its own nested repo. This means the existing structure is **already monorepo-shaped** — adding `frontend/` as a sibling of `backend/` continues the established layout rather than introducing a new one. No new repo-structure decision is needed.
- **Backend is real and running:** 5 migrations applied (including Partner/Referral), `tsc --noEmit` clean, 23/23 unit tests, 79/79 e2e tests against real Postgres (per `PHASE4_REPORT.md`, most recently re-verified in this session's environment-recovery pass). The API surface frontend will integrate against is not a stub.
- **`docker-compose.yml`** currently defines Postgres only — no frontend service. Adding one is additive, not a conflict.
- **Design-token handoff already exists** at `docs/brand/` (`design-tokens.css`, `design-tokens.json`, `README.md`) — approved, ready to consume.
- **One known runtime bug in the backend, disclosed and unfixed pending your go-ahead** (from the prior verification pass): `main.ts` crashes on boot (`cookie-parser` CJS/ESM interop, missing `esModuleInterop`). This matters directly for this plan because **§4 below (BFF cookie-wrapping) needs a running backend to integrate against** — flagged again under Architectural Conflicts.

## 2. Architecture/ADR read — what's already decided

| Decision | Source | What it fixes |
|---|---|---|
| **Frontend = Next.js + TypeScript + Tailwind CSS** | `27_ADRS.md` ADR-009 (RESOLVED, finalized before Phase 4) | Not open for reconsideration — this plan builds on it, doesn't re-derive it. |
| SSR/SSG is a **hard requirement** for indexable pages; search results and the booking flow may be client-rendered | `19_SEO.md` §19.3 | Directly implies Next.js App Router (SSR/ISR per route), not a pure SPA. |
| Locale-first URLs: `/{locale}/...`, six locales supported, AZ/EN/RU content-active at launch (TR/DE/ES infra-ready only) | `06_INFORMATION_ARCHITECTURE.md` §6.1/6.4, `27_ADRS.md` ADR-007 | Fixes the top-level routing shape. |
| Three separate site maps/auth contexts: customer (`/{locale}/...`), provider (`/provider/...`), admin (`/admin/...`) | `06_INFORMATION_ARCHITECTURE.md` §6.1–6.3 | Fixes top-level route groups and that provider/admin are **not locale-prefixed**. |
| REST + OpenAPI as the contract, not GraphQL | `27_ADRS.md` ADR-003, `29_API_OPENAPI.yaml` | The frontend's API client should be generated from `29_API_OPENAPI.yaml`, not hand-written per endpoint (keeps it drifting with the contract, not the other way around). |
| WCAG AA accessibility is an **acceptance criterion**, not a stretch goal | `07_UX_ARCHITECTURE.md` §7.7, `08_DESIGN_SYSTEM.md` §8.1 | Sets the accessibility bar below. |
| Mandatory light/dark/system theming, mandatory responsive breakpoints, mandatory i18n-tolerant layout | `08_DESIGN_SYSTEM.md` §8.5–8.7 | These are **already binding requirements** on whatever gets built, independent of this plan. |
| Spacing tokens (4px base, 4/8/12/16/24/32/48/64 scale) | `08_DESIGN_SYSTEM.md` §8.1 | Reused as-is (§5 below). |
| Color + typography tokens | `docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md` §15–16, `docs/brand/design-tokens.{css,json}` | Approved, consumed as-is (§5 below). |
| Radius/elevation/shadow tokens | `08_DESIGN_SYSTEM.md` §8.1 — explicitly **left open**, deferred to "the actual build phase" | Not yet decided anywhere. This plan is that build phase — proposed in §5, flagged as new. |

**No new framework is introduced anywhere in this plan** — Next.js/TypeScript/Tailwind is treated as fixed.

## 3. Repository structure (proposed)

```
flexspace/
├── backend/                  (unchanged)
├── frontend/                 (new)
│   ├── app/
│   │   ├── [locale]/         customer-facing site — locale-prefixed (§6.1)
│   │   ├── provider/         provider dashboard — NOT locale-prefixed (§6.2)
│   │   ├── admin/            admin control center — NOT locale-prefixed (§6.3)
│   │   └── api/               Next.js Route Handlers — the BFF layer (§4)
│   ├── components/
│   │   ├── ui/                primitive components (Button, Input, Card, Badge, Modal…)
│   │   └── features/          feature-composed components (SearchBar, RoomCard, BookingPanel…)
│   ├── lib/
│   │   ├── api-client/        generated from 29_API_OPENAPI.yaml (§4)
│   │   ├── auth/               BFF session helpers
│   │   └── i18n/                translation loading, locale routing config
│   ├── styles/
│   │   └── tokens.css         generated/copied from docs/brand/design-tokens.css (§5)
│   ├── public/
│   │   └── brand/              logo SVGs, favicon, OG image (§9)
│   ├── messages/               translation JSON per locale (next-intl convention)
│   └── tests/
├── docs/                      (unchanged)
└── docker-compose.yml         (extended: add a frontend dev service — optional, see §11)
```

This mirrors the module-per-domain discipline `22_INFRASTRUCTURE.md` §22.4 already applies to the backend: `app/[locale]`, `app/provider`, `app/admin` are separated the same way the three site maps in `06_INFORMATION_ARCHITECTURE.md` are separated, not flattened into one route tree.

## 4. Architectural conflicts and missing decisions identified

This is the section you explicitly asked for. Two were resolved with you directly during this planning pass; the rest are new findings from this inspection.

### 4.1 Resolved during this planning pass

1. **Auth token model vs. SSR.** The backend's `AuthController` returns `{accessToken, refreshToken}` in the response body (confirmed by reading `auth.controller.ts` directly) — there are no httpOnly cookies today. SSR pages that need authenticated data (`/account/*`, `/provider/*`, `/admin/*`) can't read a body-returned token server-side on a later request. **Resolved: Next.js Route Handlers act as a thin BFF** — they call the NestJS API, receive the token pair, and re-set it as httpOnly cookies on the frontend's own domain. Server Components read the cookie; the backend itself is untouched. This adds a `lib/auth/` layer to the frontend but requires zero changes to the already-shipped, already-tested backend auth module.
2. **Frontend hosting.** Not specified anywhere — `22_INFRASTRUCTURE.md`'s infrastructure diagram predates ADR-009's frontend framework decision and only shows a single backend compute node. **Resolved: Vercel.** This is a provider not in the existing diagram; flagging that the diagram should get a small addition once this is implemented (not urgent, not blocking).

### 4.2 New findings — need your call before/while building

3. **Backend boot bug blocks BFF integration testing.** §1 above — `main.ts` won't currently start (`cookie-parser` interop crash, disclosed in the last verification report, not yet fixed). The BFF pattern in #1 needs a running backend to develop and test against. This doesn't block writing frontend code against a mocked/typed client, but it does block real integration testing. **Needs your go-ahead to apply the one-line fix** (`esModuleInterop: true` in `backend/tsconfig.json`, or swap the import style) — still outstanding from the prior turn, re-surfaced here because this phase now depends on it.
4. **Logo asset files don't exist yet.** The approved Concept A mark exists only as inline SVG inside the concept-board HTML (`docs/spotva-identity-concept.html`) and as prose construction rules (`docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md` §12). There is no `logo.svg`, no favicon, no OG image as an actual exportable file yet. **Not a re-opening of the brand decision** — the mark itself is approved — but the production asset files (§9 below) need to be generated before any component can reference them, and that's a small, mechanical task this plan schedules as step 1 of implementation, not a new design decision.
5. **i18n routing library.** `20_I18N.md` and `06_INFORMATION_ARCHITECTURE.md` specify the *behavior* (locale-first URLs, hreflang, six locales, three content-active) but — consistent with ADR-009's own note that pre-Phase-4 docs were written framework-agnostic — no specific Next.js i18n library is named. **Proposed: `next-intl`** (the standard App Router i18n solution — locale-prefixed routing, `hreflang`-compatible, typed message catalogs, active maintenance). This is an implementation detail, not an architectural fork — flagged for awareness, not blocking.
6. **API client generation.** Not specified anywhere, but ADR-003 already establishes `29_API_OPENAPI.yaml` as the source of truth the backend implements against. **Proposed:** generate a typed TypeScript client from that same OpenAPI file (`openapi-typescript` + a thin fetch wrapper, or `orval`) rather than hand-writing `fetch` calls per endpoint — keeps the frontend from silently drifting out of sync with the contract, the same discipline ADR-003 already applies to the backend side.
7. **Radius/elevation/shadow tokens.** `08_DESIGN_SYSTEM.md` §8.1 explicitly deferred these to "the actual build phase" — this is that phase. Proposed in §5 below as new, small, low-risk additions to the token set (not a brand decision — no color/logo/type implication).
8. **State/data-fetching library.** Not specified. Proposed: React Server Components + native `fetch` for SSR/SSG data (room detail, provider profile, SEO landing pages); **TanStack Query** for client-rendered interactive state (live search results, the booking flow, provider/admin dashboards) — this maps directly onto `19_SEO.md` §19.3's own SSR-vs-CSR split, it doesn't invent a new one.
9. **Frontend environment/secrets.** New file needed: `frontend/.env.local.example` (API base URL, a session-cookie signing secret for the BFF, Google Maps browser key per `15_MAPS_ARCHITECTURE.md`, Vercel-specific env if applicable) — analogous to `backend/.env.example`, doesn't exist yet.

None of items 5–9 are architectural conflicts requiring a decision meeting — they're gaps the existing docs left open by design (framework-agnostic until ADR-009, token values deferred to build phase) and this plan proposes reasonable, low-risk fills. Flagged individually so any of them can be overridden before implementation starts.

## 5. Design-token integration

- `docs/brand/design-tokens.css` is copied (or symlinked via a small build step) into `frontend/styles/tokens.css` and imported once in the root layout. No values are re-derived by hand in component code — this is the same rule `08_DESIGN_SYSTEM.md` §8.5 already states ("a component that hardcodes a color instead of referencing a token is a defect").
- Tailwind config maps its theme onto the CSS custom properties (`colors: { bg: 'var(--color-bg)', accent: 'var(--color-accent)', … }`) rather than duplicating hex values into `tailwind.config.ts` — one source of truth, two consumption points (raw CSS and Tailwind utility classes).
- `docs/brand/design-tokens.json` feeds the Tailwind config generation step (or is consumed directly if a JS/TS theme object is preferred over hardcoding the mapping).
- **New tokens proposed to close the §4.2-7 gap** (radius/elevation — not previously defined anywhere):

  | Token | Value | Use |
  |---|---|---|
  | `--radius-sm` | 6px | Inputs, small buttons, badges |
  | `--radius-md` | 10px | Buttons, cards (matches the amber CTA button spec already shown in the concept board) |
  | `--radius-lg` | 16px | Modals, elevated panels |
  | `--shadow-sm` | `0 1px 2px rgba(20,20,15,0.06)` | Resting cards |
  | `--shadow-md` | `0 4px 16px rgba(20,20,15,0.10)` | Dropdowns, popovers |
  | `--shadow-lg` | `0 12px 32px rgba(20,20,15,0.14)` | Modals |

  These are proposed, not approved — flagged in §4.2 item 7 rather than silently added to the approved-brand token files.

## 6. Component architecture

- **Two-tier structure**, matching `08_DESIGN_SYSTEM.md` §8.2's component inventory: `components/ui/` holds primitives with no business logic (Button, Input, Select, DatePicker, Card, Badge, Modal, Dropdown, Alert/Toast, skeleton loaders) built once against the token set; `components/features/` composes them into product-specific units (SearchBar, RoomListingCard, AvailabilityCalendar, BookingSummaryPanel, ProviderCard, ReviewList).
- Every `ui/` component is built against §8.2's required-states table directly — default/hover/active/disabled/loading for buttons, default/focus/error/disabled for inputs, etc. — not discovered ad hoc per feature.
- Server Components by default (Next.js App Router convention); a component only becomes a Client Component when it needs interactivity/state (forms, the booking flow, filters, the map). This isn't a new rule — it's what makes the §19 SSR/CSR split actually work at the component level, not just the route level.
- The Listing Card (§8.2: "the single most-reused component in the product") is built first, before any page that uses it, since search results, favorites, provider profile, and homepage "Popular" sections all consume the same component.

## 7. Routing

Next.js App Router, matching `06_INFORMATION_ARCHITECTURE.md` exactly:

```
app/[locale]/(customer)/page.tsx                       /{locale}/
app/[locale]/(customer)/[city]/[roomType]/page.tsx      /{locale}/{city}/{room-type}   (SSR/ISR)
app/[locale]/(customer)/search/page.tsx                 /{locale}/search               (client-rendered)
app/[locale]/(customer)/rooms/[slug]/page.tsx           /{locale}/rooms/{slug}-{id}    (SSR/ISR)
app/[locale]/(customer)/providers/[slug]/page.tsx       /{locale}/providers/{slug}-{id}(SSR/ISR)
app/[locale]/(customer)/booking/[bookingId]/page.tsx    /{locale}/booking/{booking-id} (client-rendered, auth-light)
app/[locale]/(customer)/account/...                     /{locale}/account/*            (SSR via BFF cookie, §4)
app/provider/...                                        /provider/*   — NOT locale-prefixed, per §6.2
app/admin/...                                           /admin/*      — NOT locale-prefixed, per §6.3
app/api/...                                              BFF route handlers (§4), not user-facing routes
```

`robots.txt`/`sitemap.xml` generation excludes `account`, `booking`, `provider`, `admin` exactly as `19_SEO.md` §19.6 specifies — implemented via Next.js's `robots.ts`/`sitemap.ts` conventions, generated from the same search module data source `19_SEO.md` §19.2 already mandates (no hand-authored page list).

## 8. Responsive strategy

Directly implements `08_DESIGN_SYSTEM.md` §8.6 — not a new strategy. Breakpoints (1440/1024/768/390/375), the per-component desktop→mobile pattern table (search list/map toggle, filter drawer, sticky booking CTA, hamburger nav, bottom-sheet modals), and the ≥44×44px touch-target rule are implemented as Tailwind breakpoint utilities plus the shared responsive primitives §8.6 already calls for (a bottom-sheet component, a touch-target-minimum utility) built once in `components/ui/` and reused, never a bespoke per-screen solution.

## 9. Light/dark/system theme handling

Directly implements `08_DESIGN_SYSTEM.md` §8.5 and reuses the exact three-state pattern already validated in `docs/brand/design-tokens.css` (bare `:root` = light default, `prefers-color-scheme` = system dark unless an explicit light choice overrides it, `[data-theme]` = explicit user choice, winning in both directions):

- Theme preference persisted via `localStorage` + a cookie (so the Next.js server component rendering the `<html>` tag can set `data-theme` at SSR time — avoids the flash-of-wrong-theme §8.5 calls out).
- Header theme toggle (☀️/🌙, reflecting resolved theme) built as a Client Component, per §8.5's requirement that it be a persistent header control, not settings-page-only.
- Every surface — cards, inputs, dropdowns, modals, the map and its controls, badges, toasts, booking/payment panels — checked in both themes as two separate pass/fail states per §8.6's Definition of Done, not assumed to inherit.

## 10. Accessibility

Directly implements `07_UX_ARCHITECTURE.md` §7.7 as binding acceptance criteria, not aspirational:

- Full keyboard navigation for search, filters, date/time pickers, and the booking flow, with visible focus states on every interactive element (built into `components/ui/` primitives once, inherited everywhere).
- ARIA labels on every icon-only control (map markers, favorite heart, filter chips).
- WCAG AA contrast — already satisfied by construction for the approved token set (every pairing in `docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md` §15 was computed, not eyeballed); the new radius/shadow tokens in §5 don't affect contrast.
- Explicit `<label>` elements on all form fields — never placeholder-as-label.
- Screen-reader live regions (`aria-live`) for async state changes: filter-updated result counts, availability-check confirmation, booking-status changes.
- `08_DESIGN_SYSTEM.md` §8.4's i18n-length-tolerance rule (RU/DE run 30–40% longer than EN) is a layout/accessibility rule together — components use flexible width and defined truncation-with-tooltip rules, never fixed-pixel labels.

## 11. Logo/brand asset integration

1. **Generate the actual asset files first** (currently missing per §4.2 item 4): `logo-horizontal.svg`, `icon-mark.svg`, light/dark/monochrome variants, `favicon.svg`/`favicon.ico`, `apple-touch-icon.png`, a social/OG share image — all derived mechanically from the already-approved Concept A construction spec (`docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md` §11–14), not a new design pass.
2. Assets live in `frontend/public/brand/`, referenced via Next.js's `app/icon.tsx`/`app/apple-icon.tsx`/metadata conventions for favicon and OG image, and as a `<Logo>` component (wrapping the SVG, accepting a `variant` prop for light/dark/icon-only) for in-page use — never an inline `<img src="...">` per page, so the mark is guaranteed pixel-identical everywhere per the guidelines' Do/Don't table (§24: "use the SVG master and export from it, never redraw or trace per use case").
3. `<Logo>` respects the same `data-theme` mechanism as §9 — light lockup on light surfaces, dark lockup on dark surfaces, automatically, not a manually-chosen prop per page.

## 12. Testing strategy

Mirrors the backend's own stated discipline (`PHASE4_REPORT.md` — "never mock what you can test for real," unit tests for logic, e2e against a real system):

- **Unit/component tests:** Vitest + React Testing Library for `components/ui/` (states, accessibility roles, keyboard interaction) and `components/features/` (composition logic).
- **Integration/e2e:** Playwright, run against the real Next.js app **and** the real NestJS backend (not a mocked API) for the flows that matter most: search → room detail → booking → payment redirect, auth login/refresh through the BFF cookie layer, and locale switching preserving state. This directly extends the backend's existing "real Postgres, never mocked repositories" ethos to the frontend boundary — a mocked API layer would hide exactly the kind of contract-drift bug the OpenAPI-generated client (§4.2 item 6) is meant to prevent.
- **Visual/responsive:** breakpoint checks at the five `08_DESIGN_SYSTEM.md` §8.6 breakpoints as part of component test setup, not a separate manual pass.
- **Accessibility:** automated `axe-core` checks wired into the component test suite, catching contrast/label/ARIA regressions before a human review pass.

## 13. Build/deployment considerations

- **Vercel** for the frontend (per your decision in §4.1), talking to the NestJS backend's public API URL via environment variable — no change to how the backend deploys (`22_INFRASTRUCTURE.md` §22.2's Render/Railway/Fly recommendation stands for the backend only).
- CORS: `backend/src/main.ts` already calls `app.enableCors({ origin: config.get('corsOrigin'), credentials: true })` — `credentials: true` is required for the BFF cookie pattern (§4) to work cross-origin between Vercel's domain and the backend's; `CORS_ORIGIN` needs to be set to the real Vercel deployment URL (currently a `.env` placeholder).
- `docker-compose.yml` gets an optional frontend dev service added for local parity (not required — `next dev` against a local backend on `localhost:3001` works without it), flagged as a nice-to-have, not a blocker.
- Local development needs the backend boot bug (§4.2 item 3) fixed to test the BFF layer end-to-end — the earliest point this plan actually needs that decision made.
- CI: `PHASE4_REPORT.md` already notes no CI config exists yet for the backend either — frontend CI (typecheck, lint, unit tests, Playwright against a preview deploy) is proposed as part of the same CI setup work, not a separate effort.

## 14. Suggested sequencing (P4-9 → P4-10)

Not a commitment to build yet — this is the order the above implies, for your review:

1. Fix the backend boot bug (§4.2 item 3) — unblocks everything that needs a running API.
2. Generate brand asset files (§11.1) — small, mechanical, unblocks any component referencing the logo.
3. Scaffold `frontend/` (Next.js + TypeScript + Tailwind), wire in `docs/brand/design-tokens.css` (§5), set up the OpenAPI-generated client (§4.2 item 6) and `next-intl` (§4.2 item 5).
4. Build `components/ui/` primitives against §6/§8/§10's states/responsive/a11y requirements.
5. Build the BFF auth layer (§4.1) and the Listing Card + search/room-detail pages (highest-reuse, highest-value first).
6. Provider and admin route groups.
7. Playwright e2e across the critical flows (§12).

---

### What I need from you before any of this starts

- Go-ahead to fix the backend boot bug (§4.2 item 3) — a one-line change to already-shipped code, held pending your explicit approval since last turn.
- Any objection to the proposed radius/elevation tokens (§5), `next-intl` (§4.2-5), the OpenAPI-generated client approach (§4.2-6), or TanStack Query (§4.2-8) — all implementation-level fills for gaps the architecture docs left open, not brand or architecture reversals, but flagged individually so you can veto any one of them before code is written.
