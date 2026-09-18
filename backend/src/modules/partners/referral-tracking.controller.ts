import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ReferralTrackingService } from './referral-tracking.service';
import { Public } from '../../common/decorators/public.decorator';
import { REFERRAL_ATTRIBUTION_COOKIE_NAME } from '../../common/constants/partner.enum';

/** Only a same-origin-relative path is ever honored — `to=https://evil.example` or `to=//evil.example` would turn a trusted marketplace link into an open redirect, so anything else falls back to the homepage. */
function sanitizeLandingPath(to: unknown): string {
  if (typeof to !== 'string' || to.length === 0) return '/';
  if (!to.startsWith('/') || to.startsWith('//')) return '/';
  if (to.includes('\\') || /^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(to)) return '/'; // e.g. "/\evil" or "/javascript:..." tricks
  return to;
}

/**
 * 31_PARTNER_REFERRAL_ARCHITECTURE.md §31.4 — `GET /r/{code}`, the single
 * public entry point of the whole attribution flow. Deliberately excluded
 * from the API's versioned prefix (see main.ts's setGlobalPrefix exclude)
 * so partner links stay short: `[MARKETPLACE_DOMAIN]/r/BLOGGER123`.
 */
@ApiTags('Partners')
@Controller('r')
export class ReferralTrackingController {
  constructor(
    private readonly trackingService: ReferralTrackingService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get(':code')
  // V1 fraud mitigation (§31.7 — no fraud-detection AI): rate-limit the one
  // endpoint an attacker could hammer to spam click rows or fish for valid
  // codes. A real partner's audience clicking a shared link never approaches
  // this limit.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Public tracking redirect — records a click, sets an attribution cookie, redirects to the marketplace',
  })
  async track(
    @Param('code') code: string,
    @Query('to') to: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const landingPath = sanitizeLandingPath(to);

    const result = await this.trackingService.trackClick({
      code,
      ipHash: this.trackingService.hashIp(req.ip),
      userAgent: req.headers['user-agent'],
      landingPath,
    });

    if (result) {
      res.cookie(REFERRAL_ATTRIBUTION_COOKIE_NAME, result.attributionToken, {
        httpOnly: true,
        secure: this.configService.get<string>('nodeEnv') === 'production',
        sameSite: 'lax',
        maxAge: result.attributionWindowDays * 86_400_000,
        path: '/',
      });
    }
    // An invalid/unknown code, a paused/ended campaign, or a suspended
    // partner all fall through to here with `result === null` — no cookie
    // set, but still a normal redirect to the marketplace rather than an
    // error page (§31.4's flow step 2 doc comment on trackClick).

    const base = this.configService.get<string>('corsOrigin') ?? '/';
    res.redirect(HttpStatus.FOUND, `${base}${landingPath}`);
  }
}
