import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';

import { ForbiddenDomainException } from '../../../../shared/exceptions/domain.exception';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPerms || requiredPerms.length === 0) return true;

    const user = this.getUser(context);
    if (!user) throw new ForbiddenDomainException('No user in request');

    // Wildcard admin: cortocircuita cualquier chequeo.
    if (user.permissions?.includes(PERMISSIONS.ADMIN_ALL)) return true;

    const ok = requiredPerms.some((p) => user.permissions?.includes(p));
    if (!ok) {
      throw new ForbiddenDomainException(
        `Insufficient permissions. Required: ${requiredPerms.join(', ')}`,
      );
    }
    return true;
  }

  private getUser(context: ExecutionContext): JwtPayload | undefined {
    if (context.getType<'graphql' | 'http'>() === 'graphql') {
      return GqlExecutionContext.create(context).getContext().req?.user;
    }
    return context.switchToHttp().getRequest().user;
  }
}
