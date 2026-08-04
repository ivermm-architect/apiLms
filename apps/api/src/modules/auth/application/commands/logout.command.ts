import { createHash } from 'node:crypto';

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { DrizzleAuditRepository } from '../../../admin/infrastructure/drizzle-audit.repository';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../../domain/ports/refresh-token.repository';

export class LogoutCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly refreshToken?: string,
    public readonly allDevices = false,
    public readonly sessionId?: string,
  ) {}
}

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  async execute(cmd: LogoutCommand): Promise<void> {
    if (cmd.allDevices) {
      await this.refreshTokens.revokeAllForUser(cmd.userId);
    } else if (cmd.sessionId) {
      // Cierre de la sesión actual: preferimos el sessionId del JWT (siempre
      // disponible), con fallback al hash del refresh token si se envía.
      await this.refreshTokens.revokeBySessionId(cmd.sessionId);
    } else if (cmd.refreshToken) {
      const hash = createHash('sha256').update(cmd.refreshToken).digest('hex');
      const stored = await this.refreshTokens.findByHash(hash);
      if (stored) {
        await this.refreshTokens.revoke(stored.id);
      }
    }

    // Auditar el cierre de sesión (historial de accesos)
    await this.audit
      .log({
        userId: cmd.userId,
        action: 'logout',
        metadata: {
          sessionId: cmd.sessionId,
          allDevices: cmd.allDevices,
          description: cmd.allDevices
            ? 'Cierre de todas las sesiones'
            : 'Cierre de sesión',
        },
      })
      .catch(() => {});
  }
}
