import { createHash, randomUUID } from 'node:crypto';

import { schema, Database } from '@cieba/db';
import { ROLE_PERMISSIONS, RoleName } from '@cieba/shared';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';

import { DATABASE } from '../../../../core/database/database.module';
import { UnauthorizedDomainException } from '../../../../shared/exceptions/domain.exception';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../../domain/ports/refresh-token.repository';
import { TOKEN_PORT, TokenPort } from '../../domain/ports/token.port';

export class RefreshCommand implements ICommand {
  constructor(public readonly refreshToken: string) {}
}

@CommandHandler(RefreshCommand)
export class RefreshHandler implements ICommandHandler<RefreshCommand> {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TOKEN_PORT) private readonly tokens: TokenPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
  ) {}

  async execute(cmd: RefreshCommand) {
    // 1. Verificar firma del token
    let payload;
    try {
      payload = this.tokens.verifyRefresh(cmd.refreshToken);
    } catch {
      throw new UnauthorizedDomainException('Refresh token inválido');
    }

    // 2. Verificar que esté registrado y no revocado (hash)
    const tokenHash = createHash('sha256').update(cmd.refreshToken).digest('hex');
    const stored = await this.refreshTokens.findByHash(tokenHash);
    if (!stored) {
      // Reuse-detection: si el token existe pero ya fue revocado (rotado),
      // alguien está reutilizando un token filtrado → revocar toda la familia.
      const reused = await this.refreshTokens.findByHashAny(tokenHash);
      if (reused) {
        await this.refreshTokens.revokeAllForUser(reused.userId);
      }
      throw new UnauthorizedDomainException('Refresh token revocado');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedDomainException('Refresh token expirado');
    }

    // 3. Rotación: revocar el anterior y emitir nuevo par
    const roleRows = await this.db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.userRoles.userId, payload.sub));

    const roles = roleRows.map((r) => r.name);

    // Recalcular permisos desde el rol → cambios de matriz se propagan al refrescar.
    const permissions = [
      ...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r as RoleName] ?? [])),
    ];

    // Preservar dispositivo (UA/IP) y la identidad de sesión (sessionId) del
    // token rotado, para que la sesión mantenga su identidad en "Sesiones
    // activas" y el nuevo access token siga apuntando a la misma sesión.
    const [prev] = await this.db
      .select({
        sessionId: schema.refreshTokens.sessionId,
        userAgent: schema.refreshTokens.userAgent,
        ipAddress: schema.refreshTokens.ipAddress,
      })
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.id, stored.id))
      .limit(1);

    // Fallback: tokens emitidos antes de esta feature no tienen sessionId en el
    // payload; se usa el de la fila (siempre presente por el default de la DB).
    const sessionId = prev?.sessionId ?? payload.sessionId ?? randomUUID();

    const pair = this.tokens.generatePair({
      sub: payload.sub,
      email: payload.email,
      roles,
      permissions,
      sessionId,
    });
    const newHash = createHash('sha256').update(pair.refreshToken).digest('hex');

    const saved = await this.refreshTokens.save({
      userId: payload.sub,
      sessionId,
      tokenHash: newHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      userAgent: prev?.userAgent ?? undefined,
      ipAddress: prev?.ipAddress ?? undefined,
    });

    await this.refreshTokens.revoke(stored.id, saved.id);

    return pair;
  }
}
