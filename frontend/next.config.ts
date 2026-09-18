import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// next-intl reads its request config from lib/i18n/request.ts (below) — this
// plugin wires that into Next's server-component data flow.
const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  // Keeping this empty/minimal deliberately — no experimental flags, no
  // unrequested image/domain config. Add settings here only when a real
  // page needs them (e.g. remotePatterns once provider photos are wired up).
};

export default withNextIntl(nextConfig);
