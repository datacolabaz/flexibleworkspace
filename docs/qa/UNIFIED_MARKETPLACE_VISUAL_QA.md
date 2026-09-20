# Unified Marketplace Visual QA

**Date:** 2026-09-20

## Desktop homepage

The Azerbaijani homepage was reviewed at a `1280 × 1100` viewport. `document.scrollWidth` was `1265`, so no horizontal overflow was present. The approved Spotva horizontal logo switches correctly between its light and dark variants, and the header, Baku hero, structured search, photo cards and right-hand discovery rail render without overlap. The search exposes accessible labels for activity, city, date and participant count. Partner links and sponsored inventory are visually and semantically separate from organic discovery content.

After the user confirmed the supplied light and dark dashboard concepts, the homepage was rebuilt around their core composition: a Baku hero photograph with overlaid intent-first search, three venue cards, three activity cards, a calendar/community/map/sponsor rail and a lower partner block. The implementation retains Spotva’s approved Oil Green/Amber and Fraunces/Golos system instead of copying the concepts’ temporary blue/coral palette. Both explicit light and dark modes were reviewed.

## Monetization and partner pages

The monetization table remains readable in dark mode, including the wide-table container and the 100 AZN worked example. The partner page uses the approved semantic primary color for its hero, keeps all three partner cards visually equal and exposes each external destination with an accessible link. No clipping or horizontal overflow was observed at the reviewed desktop viewport.

## Mobile review

At `390 px`, the photo-led homepage keeps the Baku hero crop, headline and four-field search within the viewport. The form stacks cleanly and the amber CTA remains full width. The 44 px navigation controls, logo, language selector, theme control and mobile menu remain visible without horizontal overflow. At `375 px`, the monetization page keeps its heading and introduction readable while containing the wide financial table in a horizontally scrollable panel.

The login page places its action card first on mobile and the account-value panel second, so sign-in is not buried. The Google control’s reserved pill container remains stable while the external SDK loads; in a live browser review the official `Continue with Google` control populated correctly.

## Google sign-in

The login page now uses a balanced two-panel desktop layout. The left panel explains account value, while the right card contains the compact Spotva mark, a secure-sign-in badge, the official Google Identity Services control and a privacy link. The Google button uses its official pill variant inside a restrained, theme-aware frame. Light and dark modes both preserve hierarchy and contrast.

## Generated photography

The Baku skyline is suitable for a wide hero crop: landmarks remain on the right while the left side provides contrast space for the headline. The workshop, podcast, coworking and event-hall assets each retain a clear subject at card scale and contain no embedded text, logos or watermarks. They are labeled as demo content until verified provider inventory and provider-owned photography replace them.

All five source outputs were converted to correctly encoded, optimized WebP assets. Their combined size is approximately 1 MB instead of roughly 24 MB.

## Automated verification

The final frontend passed TypeScript checking, ESLint, all **202 tests across 40 test files**, and a production Next.js build. The only test log noise is the expected mocked backend-unreachable message in the logout resilience test; that test passes by design.
