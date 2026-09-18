import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as not requiring authentication. JwtAuthGuard is applied
 * GLOBALLY (APP_GUARD in AppModule) so that a new endpoint is secure by
 * default; a route must opt OUT explicitly with @Public(), which is a
 * deliberate, reviewable decision rather than an easy-to-miss opt-in.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
