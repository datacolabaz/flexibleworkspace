import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware Link/useRouter/usePathname/redirect — always import these
// instead of the plain next/navigation versions inside app/[locale]/**,
// so locale-prefixed URLs are generated automatically rather than by hand.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
