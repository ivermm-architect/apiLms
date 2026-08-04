import { createHash, randomUUID } from 'node:crypto';

import { schema, Database } from '@cieba/db';
import { ROLE_PERMISSIONS, RoleName } from '@cieba/shared';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';

import { DrizzleAuditRepository } from '../../../admin/infrastructure/drizzle-audit.repository';
import { DATABASE } from '../../../../core/database/database.module';
import {
  ConflictDomainException,
  UnauthorizedDomainException,
} from '../../../../shared/exceptions/domain.exception';
import { HASHER_PORT, HasherPort } from '../../domain/ports/hasher.port';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../../domain/ports/refresh-token.repository';
import { TOKEN_PORT, TokenPort } from '../../domain/ports/token.port';

export class LoginCommand implements ICommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly ipAddress?: string,
    public readonly userAgent?: string,
  ) {}
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    emailVerified: boolean;
    mustChangePassword: boolean;
    createdAt: Date;
    roles: string[];
  };
}

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, LoginResult> {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(HASHER_PORT) private readonly hasher: HasherPort,
    @Inject(TOKEN_PORT) private readonly tokens: TokenPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  async execute(cmd: LoginCommand): Promise<LoginResult> {
    // 1. Buscar usuario
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, cmd.email))
      .limit(1);

    if (!user) {
      await this.audit
        .log({
          action: 'failed_login',
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
          metadata: {
            email: cmd.email,
            reason: 'user_not_found',
            description: `Login fallido: ${cmd.email}`,
          },
        })
        .catch(() => {});
      throw new UnauthorizedDomainException('Credenciales inválidas');
    }

    // Se permite el primer login de una cuenta `pending` cuando trae cambio de
    // contraseña forzado: entra pero la UI la lleva a /change-password. Cualquier
    // otro estado no-activo (inactive/suspended) sigue bloqueado.
    const isFirstLogin = user.status === 'pending' && user.mustChangePassword;
    if (user.status !== 'active' && !isFirstLogin) {
      throw new ConflictDomainException(`Cuenta ${user.status}`, { status: user.status });
    }

    // 2. Verificar contraseña
    const ok = await this.hasher.compare(cmd.password, user.passwordHash);
    if (!ok) {
      await this.audit
        .log({
          userId: user.id,
          action: 'failed_login',
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
          metadata: { reason: 'bad_password', description: 'Contraseña incorrecta' },
        })
        .catch(() => {});
      throw new UnauthorizedDomainException('Credenciales inválidas');
    }

    // 3. Cargar roles
    const userRoleRows = await this.db
      .select({ name: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(eq(schema.userRoles.userId, user.id));

    const roles = userRoleRows.map((r) => r.name);

    // 4. Derivar permisos desde el rol (matriz única en @cieba/shared) y generar tokens
    const permissions = [
      ...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r as RoleName] ?? [])),
    ];
    // Identidad estable de la sesión: viaja en el JWT y se persiste con el
    // refresh token, heredándose en cada rotación.
    const sessionId = randomUUID();
    const pair = this.tokens.generatePair({
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      sessionId,
    });

    // 5. Persistir hash del refresh token
    const refreshHash = this.hashToken(pair.refreshToken);
    await this.refreshTokens.save({
      userId: user.id,
      sessionId,
      tokenHash: refreshHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      ipAddress: cmd.ipAddress,
      userAgent: cmd.userAgent,
    });

    // 6. Actualizar last_login
    await this.db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id));

    // 7. Auditar el inicio de sesión (historial de accesos)
    await this.audit
      .log({
        userId: user.id,
        action: 'login',
        ipAddress: cmd.ipAddress,
        userAgent: cmd.userAgent,
        metadata: { sessionId, description: 'Inicio de sesión' },
      })
      .catch(() => {});

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expiresIn: pair.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        emailVerified: user.emailVerifiedAt != null,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
        roles,
      },
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
