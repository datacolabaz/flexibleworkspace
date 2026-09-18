# Spotva Design Tokens — Frontend Hand-off

**What this is:** the approved color and typography decisions from `docs/SPOTVA_BRAND_IDENTITY_GUIDELINES_V1.md` (§15, §16), in a form a frontend codebase can consume directly, rather than re-derived by hand from the prose spec.

**What's approved and in here:** color system (Oil Green primary, Amber CTA-only accent, neutrals, semantic colors, light + dark) and typography (Fraunces + Golos Text, full type scale).

**What's deliberately NOT in here:** tagline and mission/vision copy (still open — tracked in the guidelines doc, not design tokens to begin with) and spacing/radius/elevation tokens (spacing already exists in `docs/08_DESIGN_SYSTEM.md` §8.1; radius/elevation was explicitly left open there, pending real component work, and wasn't part of this brand-approval pass — don't infer values for those from this hand-off).

## Files

- **`design-tokens.css`** — CSS custom properties, ready to `@import` or copy into a global stylesheet. Implements the exact three-state light/system/dark pattern `08_DESIGN_SYSTEM.md` §8.5 already mandates (bare `:root` = light default, `prefers-color-scheme` = system dark, `[data-theme="dark"]`/`[data-theme="light"]` = explicit user choice wins both directions). Token names follow that document's own naming (`--color-bg-surface`, `--color-text-primary`, `--color-border-default`, `--color-accent`, …) — this file fills in values for names that document already specified, it doesn't invent a new scheme.
- **`design-tokens.json`** — the same values, framework-agnostic, for anything that wants to consume them programmatically (a Tailwind theme config, a style-dictionary build, a JS/TS theme object). Includes a couple of contrast notes worth keeping close to the values themselves, not just in the prose doc.

## The one rule most likely to get missed

Amber (the CTA accent) pairs with **dark** text (`--color-accent-on`) at its default and hover states. Only the pressed/active state (`--color-accent-active`) pairs with white (`--color-accent-active-on`). This isn't a style preference — a mid-tone amber fails WCAG AA with white text at every state except the darkest, so getting this backwards is an accessibility regression, not just an inconsistency. See `design-tokens.css`'s inline comment on `--color-accent`.

## Fonts

Both faces are on Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Golos+Text:wght@400;500;600;700&display=swap" rel="stylesheet">
```

Fraunces is a variable font with an optical-size axis (`opsz`) — the range above (`9..144`) lets it adapt its detail level between small and large sizes automatically rather than needing separate weights per size.

## Still pending before this is fully "done"

- Character-set verification for AZ/RU/TR/DE glyphs in both faces at implementation time (guidelines §16.2) — a checklist item, not expected to block starting.
- Radius/elevation/shadow tokens, once real components are being built (see "What's deliberately NOT in here" above).
- No frontend codebase exists in this repository yet — these tokens are ready to be dropped into one whenever that work starts; nothing here assumes a specific framework.
