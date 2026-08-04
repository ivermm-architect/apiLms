import { JwtPayload } from '@cieba/shared';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | unknown => {
    const req =
      ctx.getType<'graphql' | 'http'>() === 'graphql'
        ? GqlExecutionContext.create(ctx).getContext().req
        : ctx.switchToHttp().getRequest();
    const user = req?.user as JwtPayload | undefined;
    return data ? user?.[data] : user;
  },
);
