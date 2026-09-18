# Spotva frontend

Next.js (App Router) customer/provider/admin web app. Public brand is
**Spotva** — see `docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md`. The
package name (`spotva-frontend`) and this directory are internal only;
nothing here should ever surface the old internal codename.

## Structure

See `docs/phase4/FRONTEND_IMPLEMENTATION_PLAN.md` §3 for the full
rationale. Short version:

- `app/[locale]/` — customer-facing site, locale-prefixed (`/az/...`,
  `/en/...`). Own root layout (`app/[locale]/layout.tsx`), independent of
  the two below (Next.js "multiple root layouts" pattern).
- `app/provider/`, `app/admin/` — provider dashboard and admin control
  center. Deliberately **not** locale-prefixed
  (`06_INFORMATION_ARCHITECTURE.md` §6.2/§6.3). Each has its own root
  layout for the same reason.
- `app/api/` — Route Handlers acting as a thin BFF (cookie-wraps the
  backend's token-pair auth response into httpOnly cookies — nothing in
  the NestJS backend changes).
- `lib/i18n/` — next-intl routing/config (six locales, az default;
  az/en/ru content-active, tr/es/de fall back to English string-by-string
  per `20_I18N.md` §20.7).
- `lib/api-client/` — typed client generated from
  `docs/phase2/29_API_OPENAPI.yaml` (ADR-009's own contract). `schema.d.ts`
  is generated, never hand-edited — run `npm run generate:api` after the
  OpenAPI spec changes and commit the diff. `client.ts` is the thin
  `openapi-fetch` wrapper (bearer-token middleware, error-envelope
  unwrapping); it's `server-only` on purpose — Server Components and
  Route Handlers call it directly (RSC + native fetch, no TanStack Query
  per the go-ahead), a Client Component never imports it.
- `styles/tokens.css` — copy of the approved `docs/brand/design-tokens.css`
  plus the frontend-build-phase radius/shadow additions
  (`FRONTEND_IMPLEMENTATION_PLAN.md` §5). Edit tokens there, not here, if a
  brand value changes; this file is a copy for build purposes.
- `public/brand/` — copy of the approved, verified logo assets from
  `docs/brand/assets/`. Always render the mark via `components/ui/Logo.tsx`
  rather than a raw `<img>` per page.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
