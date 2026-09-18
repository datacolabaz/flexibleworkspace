# 08 — Design System Specification

**Positioning:** professional marketplace-grade — not heavy enterprise-corporate, not a bare CRUD admin look. The target feel is closer to a trusted travel/booking product (think: the calm confidence of a well-run booking flow) than a SaaS dashboard. Warm but efficient; premium but not decorative.

## 8.1 Foundations

- **Typography:** one primary typeface for UI (a humanist sans with excellent Cyrillic + Latin + Azerbaijani-specific character support — Azerbaijani uses Ə/ə and other Latin-extended characters that not every "clean" web font covers well; this must be verified for whichever typeface is finalized in `08` implementation, not assumed). Type scale: a restrained 6–7 step scale (display, h1, h2, h3, body, small, caption) reused consistently rather than ad hoc sizing per screen.
- **Spacing:** 4px base unit, scale of 4/8/12/16/24/32/48/64. All component padding/margin values are multiples of this unit — this is what makes a UI feel "designed" rather than "assembled," and it costs nothing extra to enforce from day one.
- **Color:** a neutral base palette (grays with a very slight warm tint, not pure cold gray) + one primary brand color + one accent color for CTAs distinct from the primary (so "Find a space" / "Book & Pay" buttons are visually distinct from purely navigational links) + semantic colors (success/warning/error/info) + a verified-badge color distinct from all of the above. All text/background pairs validated to WCAG AA contrast minimum (`07_UX_ARCHITECTURE.md`).
- **Elevation/radius:** a small set of consistent corner-radius and shadow tokens (e.g. card radius, modal radius, button radius as three distinct but related values) rather than freely varying per component.

## 8.2 Core Components

| Component | Key states to design | Notes |
|---|---|---|
| Buttons | default/hover/active/disabled/loading, primary/secondary/tertiary/destructive | Loading state must be built in from the start — booking/payment actions need it |
| Inputs (text, select, textarea) | default/focus/error/disabled, with inline validation message slot | Must support RTL-safe layout even though none of the 6 launch languages are RTL today — cheap to build in now, expensive to retrofit if a future market needs it |
| Date picker | single date, with unavailable dates visually distinct from available ones | Localized (weekday start, date format) per `20_I18N.md` |
| Time picker | start time + duration/end-time combined control | Must show real-time availability inline, not just a generic time grid |
| Cards | listing card (list view), provider card, category card | Listing card is the single most-reused component in the product — photo, price, rating, distance, verified badge, favorite toggle |
| Badges | Verified, Featured, New, category tag | Verified badge visually distinct and consistent everywhere it appears (search card, room detail, provider profile) |
| Map marker | default/hover/selected/cluster | Cluster state needed once a city has enough density to cause marker overlap |
| Filters | chip-style active filters + a filter drawer/panel for mobile | Filter drawer must preserve applied state when reopened |
| Modal | confirmation modals (cancel booking, block time), never used for the core booking flow itself (booking flow is inline/page-based, not modal-based, per `07_UX_ARCHITECTURE.md`) |
| Dropdown/select | language switcher, sort control, currency (future) | Keyboard-navigable |
| Alerts / toast | success/error/info, auto-dismiss for toast, persistent for page-level alerts | Toast used for non-blocking confirmations (e.g. "Added to favorites") |
| Loading states | skeleton blocks matching final content shape | See `07_UX_ARCHITECTURE.md` §7.6 |
| Calendar (provider) | month/week view, booked/blocked/available color coding | Core provider-dashboard component; must render fast with many rooms |

## 8.3 What This Document Deliberately Does Not Specify

Exact hex values, exact typeface name, and pixel-perfect component mockups are intentionally left to the actual design/build phase (`Phase 3 — UX/UI Design` in the roadmap), not fixed here — this document defines the **system and constraints** (tokens, states, accessibility bar, component inventory) so that phase can move fast without re-litigating structure, while leaving room for real visual exploration against real content (photos of actual Baku spaces) rather than placeholder Lorem Ipsum design.

## 8.4 Multilingual & RTL Considerations in Component Design

Buttons and nav items must accommodate text-length variance across AZ/EN/RU/TR/DE/ES (German and Russian strings routinely run 30–40% longer than English for the same UI label) — components are designed with flexible width, not fixed-pixel labels, and truncation rules (with a tooltip/title attribute fallback) defined per component rather than left to chance (see `20_I18N.md`).

## 8.5 Theme Tokens: Light/Dark Mode (Mandatory)

**Status: mandatory rule for all frontend implementation from Phase 4 onward** (elevated from an unstated gap to an explicit requirement before frontend build began — no frontend code existed yet at the time this was added, so nothing needed retrofitting).

- Every color used anywhere in the frontend is a **design token**, never a literal hex value in component code — `color-bg-surface`, `color-text-primary`, `color-border-default`, `color-accent`, etc., each with a light and a dark value. A component that hardcodes a color instead of referencing a token is a defect, not a style preference.
- Three resolvable states, matching how the Phase 3 artifact tokens were already structured (`artifact-design` conventions carried into the app, not a new scheme): **explicit light**, **explicit dark**, and **system** (follows OS/browser `prefers-color-scheme`, used as the default on first visit).
- The user's explicit choice (if any) is persisted (e.g. `localStorage` + a cookie for SSR-correct first paint, avoiding a flash of the wrong theme) and wins over the system preference on every later visit; absent an explicit choice, the system preference is honored and re-checked live if the OS setting changes mid-session.
- Header carries a two-state theme toggle (☀️ light / 🌙 dark, reflecting the *current* resolved theme, not the setting) — a button, not a settings-page-only control, since this is a frequently-used preference.
- **"Dark mode" means every surface, not just the page background:** cards, inputs, dropdowns, modals/bottom sheets, tables, the map and its controls, badges, toasts, and the booking/payment panels are each explicitly verified in both themes — text contrast (WCAG AA, per §8.1) re-checked per surface, not assumed to inherit correctly. Component QA (§8.6) treats "light mode" and "dark mode" as two separate pass/fail checks per screen, not one.

## 8.6 Responsive Design Rules (Mandatory — Definition of Done)

**Status: mandatory rule for all frontend implementation from Phase 4 onward.** Every new frontend component is built responsive-by-design (not desktop-first-then-adapted): laid out and verified at all of the target breakpoints below before it is considered done, not fixed up afterward.

**Verification breakpoints:** 1440px+ (desktop), 1024px (laptop), 768px (tablet), 390px and 375px (mobile — two common but distinct small-phone widths). None of the following are acceptable at any breakpoint: horizontal overflow, elements running off-screen, overlapping controls, clipped text, a modal larger than the viewport, a broken navbar, filters that become unusable, or a broken map/list layout.

**Mobile is a different interaction, not a shrunk desktop layout.** Per-component mobile pattern (desktop → mobile), binding for every component in §8.2's inventory plus the screens below:

| Component/Screen | Desktop pattern | Mobile pattern |
|---|---|---|
| Search results | Synced list + map split view | List/Map toggle (already built this way in the Phase 3 screens — this formalizes it as the binding rule, not a one-off) |
| Filters | Sidebar / persistent filter panel | Filter button → bottom sheet/modal, applied state preserved when reopened (§8.2) |
| Room detail | Detail content + reservation panel side-by-side | Stacked layout with a sticky booking CTA |
| Header | Full navigation + language switcher + theme toggle inline | Compact nav (menu/hamburger) + language switcher + theme toggle still both directly reachable, not buried two levels deep |
| Buttons/CTAs | Standard hit area | Minimum comfortable touch target (≥44×44px) on every interactive element, critical CTAs (Book & Pay, Confirm) full-width and thumb-reachable |
| Modals | Centered dialog | Bottom sheet where a bottom sheet reads more native, always ≤ viewport size |
| Tables (admin/provider dashboards) | Full table | Horizontally scrollable within its own container, or a card-per-row transform — never the page itself scrolling sideways |
| Date/time picker | Inline calendar + slot grid | Full-width, thumb-scrollable slot list |

Reusable responsive patterns (spacing/breakpoint tokens, a bottom-sheet primitive, a touch-target minimum) are built once in the shared component layer and reused — never a bespoke per-screen CSS solution for the same problem.

## 8.7 Definition of Done (Frontend)

**Mandatory from Phase 4 onward:** a frontend component or screen is not "done" on a good desktop screenshot alone. It is done when it is: **Responsive** (§8.6, verified at all listed breakpoints) + **Accessible** (WCAG AA per §8.1, keyboard-navigable per §8.2) + **Light/Dark-theme-compatible** (§8.5, both themes explicitly checked) + **Internationalization-ready** (every string a translation key per `20_I18N.md` §20.1, layout tolerant of the language length variance in §8.4). All four, every time — not a checklist reserved for a later hardening pass.
