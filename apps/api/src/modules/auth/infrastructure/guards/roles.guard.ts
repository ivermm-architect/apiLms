import { JwtPayload } from '@cieba/shared';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';

import { ForbiddenDomainException } from '../../../../shared/exceptions/domain.exception';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const user = this.getUser(context);
    if (!user) throw new ForbiddenDomainException('No user in request');

    const hasRole = user.roles?.some((r) => requiredRoles.includes(r));
    if (!hasRole) {
      throw new ForbiddenDomainException(
        `Insufficient permissions. Required: ${requiredRoles.join(', ')}`,
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
