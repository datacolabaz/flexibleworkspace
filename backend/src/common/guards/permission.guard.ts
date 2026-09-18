import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import {
  AdminPermission,
  hasPermission,
} from '../constants/admin-permission.enum';
import { RoleName } from '../constants/roles.enum';
import { InsufficientPermissionException } from '../exceptions/domain.exception';

/**
 * Applied globally alongside RolesGuard (app.module.ts). A route with no
 * @RequirePermission() metadata is unaffected — this guard only enforces
 * something when a route explicitly opts in, exactly like RolesGuard's own
 * "no @Roles() metadata -> allow" default (33_ADMIN_OPERATIONAL_CONTROL_CENTER.md §33.2).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminPermission>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const roles = (request.user?.roles ?? []).map((r) => r.role as RoleName);
    const granted = roles.some((role) => hasPermission(role, required));
    if (!granted) {
      throw new InsufficientPermissionException();
    }
    return true;
  }
}
