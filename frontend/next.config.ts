import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next-intl reads its request config from lib/i18n/request.ts (below) — this
// plugin wires that into Next's server-component data flow.
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  // Keeping this empty/minimal deliberately — no experimental flags, no
  // unrequested image/domain config. Add settings here only when a real
  // page needs them (e.g. remotePatterns once provider photos are wired up).

  async headers() {
    return [
      {
        // Both GoogleSignInButton and FacebookSignInButton complete
        // through a popup window that talks back to this page via
        // window.postMessage (Google's own iframe/popup, and Facebook's
        // FB.login() popup). Without an explicit Cross-Origin-Opener-
        // Policy, some browsers isolate the popup from window.opener by
        // default, so the popup's own permission screen completes fine
        // (the person sees and clicks "Continue as ...") but the message
        // announcing that never reaches this page — the callback simply
        // never fires, which is exactly the "spins/times out with no
        // error" symptom both buttons hit. same-origin-allow-popups
        // keeps this page isolated from OTHER cross-origin windows while
        // explicitly allowing exactly this popup-opener relationship.
        source: '/:path*',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
