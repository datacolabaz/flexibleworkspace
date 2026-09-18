import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  phone: string | null;
  roles: { role: string; providerId: string | null }[];
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Applied globally (see AppModule APP_GUARD). Verifies the JWT access token
 * and attaches the decoded, authenticated user to the request. Routes opt
 * out with @Public() (11_API_CONTRACTS.md §11.4).
 *
 * This guard verifies IDENTITY only. Role checks are RolesGuard; ownership
 * checks (a provider touching only their own data) happen in each module's
 * service layer against the attached user, per 18_SECURITY.md §18.2 — never
 * only at the route layer.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();

    if (isPublic) {
      // Public routes still attach the user if a valid token happens to be
      // present (e.g. a logged-in customer browsing search results, so
      // "favorited" state can be resolved) but never require it.
      this.tryAttachUser(request);
      return true;
    }

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.accessSecret'),
      });
      request.user = {
        userId: payload.sub,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        roles: payload.roles ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token.',
      });
    }
  }

  private tryAttachUser(request: Request): void {
    const token = this.extractToken(request);
    if (!token) return;
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.accessSecret'),
      });
      request.user = {
        userId: payload.sub,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        roles: payload.roles ?? [],
      };
    } catch {
      // Invalid token on a public route: treat as anonymous, don't fail the request.
    }
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
