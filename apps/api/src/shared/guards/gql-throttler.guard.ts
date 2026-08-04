import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * ThrottlerGuard adaptado a GraphQL sobre Fastify.
 *
 * Dos incompatibilidades de @nestjs/throttler v6 con Fastify+GraphQL:
 *  1. `req.header(name)` (estilo Express). Fastify expone `req.headers` (objeto).
 *     → parcheamos `header` como método.
 *  2. La integración Apollo+Fastify pasa el Request como contexto, pero NO el
 *     reply, así que `res` llega undefined y el throttler revienta al setear
 *     los headers `X-RateLimit-*`. → si falta `res.header`, damos un stub no-op.
 *     El límite (bloqueo) sigue aplicándose; solo se omiten esos headers.
 *  3. Tracker por defecto agrupa todo bajo una sola clave → con SSR (muchas
 *     queries) un cliente agota el límite global. → getTracker por usuario/IP.
 */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  /**
   * En desarrollo no aplicamos rate-limit: el SSR de Next dispara muchas queries
   * por navegación y agotaría el límite con un solo usuario. En producción el
   * throttle se mantiene intacto.
   */
  protected override async shouldSkip(): Promise<boolean> {
    return process.env.NODE_ENV !== 'production';
  }

  /** Limita por usuario autenticado (sub del JWT) o IP, no con un contador global. */
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as { sub?: string } | undefined;
    if (user?.sub) return `user:${user.sub}`;
    const ip = (req.ip as string) ?? (req.socket as { remoteAddress?: string })?.remoteAddress;
    return `ip:${ip ?? 'unknown'}`;
  }

  override getRequestResponse(context: ExecutionContext): {
    req: FastifyRequest;
    res: FastifyReply;
  } {
    let req: FastifyRequest | undefined;
    let res: FastifyReply | undefined;

    if (context.getType<'graphql' | 'http'>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context).getContext<{
        req?: FastifyRequest;
        res?: FastifyReply;
        reply?: FastifyReply;
        request?: FastifyRequest;
      }>();
      req = gqlCtx.req ?? gqlCtx.request;
      res = gqlCtx.res ?? gqlCtx.reply ?? (req as unknown as { reply?: FastifyReply })?.reply;
    } else {
      const http = context.switchToHttp();
      req = http.getRequest();
      res = http.getResponse();
    }

    if (req && typeof (req as unknown as { header?: unknown }).header !== 'function') {
      const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
      (req as unknown as { header: (name: string) => string | undefined }).header = (name) => {
        const value = headers[name.toLowerCase()];
        return Array.isArray(value) ? value[0] : value;
      };
    }

    // Stub no-op si no hay reply (Apollo+Fastify no lo provee al contexto):
    // evita el crash al setear headers de rate-limit.
    if (!res || typeof (res as unknown as { header?: unknown }).header !== 'function') {
      res = { header: () => undefined } as unknown as FastifyReply;
    }

    return { req: req as FastifyRequest, res };
  }
}
