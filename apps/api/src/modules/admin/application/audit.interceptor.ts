import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Observable, tap } from 'rxjs';

import { DrizzleAuditRepository } from '../infrastructure/drizzle-audit.repository';

/**
 * Interceptor global opcional que audita mutaciones GraphQL.
 * Para habilitarlo: registrarlo como APP_INTERCEPTOR.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: DrizzleAuditRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isGql = context.getType<'graphql' | 'http'>() === 'graphql';
    if (!isGql) return next.handle();

    const gql = GqlExecutionContext.create(context);
    const info = gql.getInfo();

    if (info.operation.operation !== 'mutation') return next.handle();

    const ctx = gql.getContext();
    const user = ctx.req?.user;

    return next.handle().pipe(
      tap({
        next: () => {
          this.audit
            .log({
              userId: user?.sub,
              action: 'update',
              entityType: 'graphql_mutation',
              metadata: { operation: info.fieldName },
            })
            .catch((err) => this.logger.warn(`Audit log failed: ${err.message}`));
        },
      }),
    );
  }
}
