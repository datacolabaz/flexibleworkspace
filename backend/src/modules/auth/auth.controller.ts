import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { AuthService, TokenPair } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ADMIN_ROLES } from '../../common/constants/roles.enum';
import type { AuthenticatedUser } from '../../common/guards/jwt-auth.guard';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { FacebookLoginDto } from './dto/facebook-login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';

/** Task 3 — DTO for TOTP verification (setup confirmation and login second-factor). */
class TotpVerifyDto {
  @ApiProperty({ description: 'The 6-digit TOTP code from the authenticator app.' })
  @IsString()
  token: string;
}

/** Task 3 — DTO for TOTP second-factor login (userId from first-factor response). */
class TotpLoginDto {
  @ApiProperty({ description: 'The userId returned from admin-password login when totp is required.' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'The 6-digit TOTP code from the authenticator app.' })
  @IsString()
  token: string;
}

/**
 * 11_API_CONTRACTS.md §11.4 — passwordless OTP auth. All routes here are
 * @Public() by design (identity is exactly what's being established), and
 * carry a stricter per-route throttle than the global default
 * (11_API_CONTRACTS.md §11.5) since OTP request/verify are the classic
 * credential-stuffing / SMS-pumping targets.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Request a one-time login code by email or phone (05_USER_FLOWS.md §5.2)',
  })
  async requestOtp(@Body() dto: RequestOtpDto): Promise<void> {
    await this.authService.requestOtp(dto.identifier);
    // Always 204 regardless of whether the identifier is new or existing —
    // findOrCreateUser provisions silently either way, and the response
    // must not leak account-existence information (18_SECURITY.md).
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify a one-time code and receive a token pair' })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<TokenPair> {
    return this.authService.verifyOtp(dto.identifier, dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @ApiOperation({
    summary: 'Sign in (or silently register) with a verified Google ID token',
  })
  async loginWithGoogle(@Body() dto: GoogleLoginDto): Promise<TokenPair> {
    return this.authService.loginWithGoogle(dto.idToken);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('facebook')
  @ApiOperation({
    summary:
      'Sign in (or silently register) with a verified Facebook access token',
  })
  async loginWithFacebook(@Body() dto: FacebookLoginDto): Promise<TokenPair> {
    return this.authService.loginWithFacebook(dto.accessToken);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin-password')
  @ApiOperation({ summary: 'Sign in to the admin surface with an admin email and password' })
  async loginWithAdminPassword(@Body() dto: AdminLoginDto): Promise<TokenPair> {
    return this.authService.loginWithAdminPassword(dto.email, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({
    summary:
      'Rotate a refresh token for a new token pair (18_SECURITY.md — rotation on use)',
  })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  // ── Task 3 — Admin TOTP endpoints ─────────────────────────────────────

  /**
   * POST /auth/admin/totp/setup
   * Admin-only: generates a TOTP secret for the authenticated admin user
   * and returns the otpauth:// URI for QR-code rendering.
   * Does NOT enable 2FA yet — call /verify after scanning to activate.
   */
  @Post('admin/totp/setup')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Generate TOTP secret for admin 2FA setup (admin only)' })
  async adminTotpSetup(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ otpauthUri: string; secret: string }> {
    return this.authService.setupTotp(user.userId);
  }

  /**
   * POST /auth/admin/totp/verify
   * Admin-only: confirms a TOTP token from the authenticator app and
   * sets totp_enabled=true (completes 2FA enrollment).
   */
  @Post('admin/totp/verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Verify TOTP token to complete 2FA enrollment (admin only)' })
  async adminTotpVerify(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TotpVerifyDto,
  ): Promise<void> {
    await this.authService.verifyAndEnableTotp(user.userId, dto.token);
  }

  /**
   * POST /auth/admin/totp/login
   * Public second-factor endpoint: after a successful admin-password login
   * returns { requiresTotp: true, userId }, the client posts here with the
   * TOTP code to receive the real JWT token pair.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin/totp/login')
  @ApiOperation({ summary: 'Second-factor TOTP verification for admin login' })
  async adminTotpLogin(@Body() dto: TotpLoginDto): Promise<TokenPair> {
    return this.authService.verifyTotpLogin(dto.userId, dto.token);
  }
}
