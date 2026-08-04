import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { GqlContextType, GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { ZodError } from 'zod';

type HttpReply = {
  status: (code: number) => { send: (body: unknown) => unknown };
};

import { DomainException } from './domain.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter, GqlExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const contextType = host.getType<GqlContextType>();

    const { message, code, statusCode, details } = this.normalize(exception);

    if (statusCode >= 500) {
      this.logger.error(exception, (exception as Error)?.stack);
    } else {
      this.logger.warn(`${code}: ${message}`);
    }

    if (contextType === 'graphql') {
      throw new GraphQLError(message, {
        extensions: { code, statusCode, details },
      });
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<HttpReply>();
    return res.status(statusCode).send({
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  private normalize(exception: unknown): {
    message: string;
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;
  } {
    if (exception instanceof DomainException) {
      return {
        message: exception.message,
        code: exception.code,
        statusCode: exception.statusCode,
        details: exception.details,
      };
    }

    if (exception instanceof ZodError) {
      return {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details: { issues: exception.issues },
      };
    }

    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      const message =
        typeof resp === 'string'
          ? resp
          : ((resp as { message?: string }).message ?? exception.message);
      return {
        message,
        code: 'HTTP_ERROR',
        statusCode: exception.getStatus(),
      };
    }

    if (exception instanceof Error) {
      return {
        message:
          process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message,
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      };
    }

    return {
      message: 'Unknown error',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    };
  }
}
