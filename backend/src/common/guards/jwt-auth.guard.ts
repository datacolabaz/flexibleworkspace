import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RoleName } from '../constants/roles.enum';
import { UserRoleEntity } from '../../modules/auth/entities/user-role.entity';

export interface AuthenticatedUser {
  userId: string;
  email: string | null;
  phone: string | null;
  roles: { role: string; providerId: string | null }[];
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

function normalizeRole(role: string): string {
  // Access tokens issued before the admin-role rename may still carry the
  // legacy values until the user signs in again.
  if (role === 'PLATFORM_ADMIN') return RoleName.SUPER_ADMIN;
  if (role === 'SUPPORT_OPS') return RoleName.SUPPORT_ADMIN;
  return role;
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
    @InjectRepository(UserRoleEntity)
    private readonly roleRepo: Repository<UserRoleEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();

    if (isPublic) {
      // Public routes still attach the user if a valid token happens to be
      // present (e.g. a logged-in customer browsing search results, so
      // "favorited" state can be resolved) but never require it.
      await this.tryAttachUser(request);
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
      request.user = await this.toAuthenticatedUser(payload);
      return true;
    } catch {
      throw new UnauthorizedException({
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token.',
      });
    }
  }

  private async tryAttachUser(request: Request): Promise<void> {
    const token = this.extractToken(request);
    if (!token) return;
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.accessSecret'),
      });
      request.user = await this.toAuthenticatedUser(payload);
    } catch {
      // Invalid token on a public route: treat as anonymous, don't fail the request.
    }
  }

  private async toAuthenticatedUser(payload: any): Promise<AuthenticatedUser> {
    const databaseRoles = await this.roleRepo.find({
      where: { userId: payload.sub },
    });
    const roles =
      databaseRoles.length > 0 ? databaseRoles : (payload.roles ?? []);
    return {
      userId: payload.sub,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      roles: roles.map((role: { role: string; providerId: string | null }) => ({
        ...role,
        role: normalizeRole(role.role),
      })),
    };
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
