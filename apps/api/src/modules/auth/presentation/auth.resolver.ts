import { schema } from '@cieba/db';
import { Database } from '@cieba/db';
import { JwtPayload } from '@cieba/shared';
import { Inject, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import {
  EntityNotFoundException,
  UnauthorizedDomainException,
} from '../../../shared/exceptions/domain.exception';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { LoginCommand, LoginResult } from '../application/commands/login.command';
import { LogoutCommand } from '../application/commands/logout.command';
import { RefreshCommand } from '../application/commands/refresh.command';
import { HASHER_PORT, HasherPort } from '../domain/ports/hasher.port';
import { CurrentUser } from '../infrastructure/decorators/current-user.decorator';
import { Public } from '../infrastructure/decorators/public.decorator';
import { JwtAuthGuard } from '../infrastructure/guards/jwt-auth.guard';

import { AuthPayloadType, AuthUserType, SessionType, TokenPairType } from './dto/auth.types';
import {
  ChangePasswordInput,
  LoginInput,
  RefreshInput,
  UpdateProfileInput,
} from './dto/login.input';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(HASHER_PORT) private readonly hasher: HasherPort,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Mutation(() => AuthPayloadType)
  async login(
    @Args('input') input: LoginInput,
    @Context() ctx: { req?: { ip?: string; headers?: Record<string, string> } },
  ): Promise<AuthPayloadType> {
    // El login real llega vía el server action de Next, así que `req.ip` es el
    // del servidor (127.0.0.1). El cliente reenvía la IP real en X-Forwarded-For.
    const fwd = ctx.req?.headers?.['x-forwarded-for'];
    const ip = (fwd ? fwd.split(',')[0]!.trim() : undefined) || ctx.req?.ip;
    const result = await this.commandBus.execute<LoginCommand, LoginResult>(
      new LoginCommand(
        input.email.toLowerCase().trim(),
        input.password,
        ip,
        ctx.req?.headers?.['user-agent'],
      ),
    );
    return result;
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Mutation(() => TokenPairType)
  async refresh(@Args('input') input: RefreshInput): Promise<TokenPairType> {
    return this.commandBus.execute(new RefreshCommand(input.refreshToken));
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Args('refreshToken', { nullable: true }) refreshToken?: string,
    @Args('allDevices', { nullable: true }) allDevices?: boolean,
  ): Promise<boolean> {
    await this.commandBus.execute(
      new LogoutCommand(user.sub, refreshToken, allDevices ?? false, user.sessionId),
    );
    return true;
  }

  /** Mapea una fila de `users` al tipo expuesto al cliente. */
  private toAuthUser(
    row: typeof schema.users.$inferSelect,
    roles: string[],
    curriculumName: string | null = null,
  ): AuthUserType {
    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone ?? null,
      birthday: row.birthday ?? null,
      profession: row.profession ?? null,
      bio: row.bio ?? null,
      avatarUrl: row.avatarUrl ?? null,
      studentCode: row.studentCode ?? null,
      documentId: row.documentId ?? null,
      cohortYear: row.cohortYear ?? null,
      curriculumName,
      status: row.status,
      emailVerified: row.emailVerifiedAt != null,
      mustChangePassword: row.mustChangePassword,
      lastLoginAt: row.lastLoginAt ?? null,
      createdAt: row.createdAt,
      roles,
    };
  }

  /**
   * Nombre de la malla del alumno, derivado de sus matrículas
   * (enrollments → courses → curricula). Null si no es alumno o no tiene
   * matrículas ligadas a una malla. No ejecuta join para staff.
   */
  private async resolveCurriculumName(userId: string, roles: string[]): Promise<string | null> {
    if (!roles.includes('student')) return null;
    const [row] = await this.db
      .select({ name: schema.curricula.name })
      .from(schema.enrollments)
      .innerJoin(schema.courses, eq(schema.enrollments.courseId, schema.courses.id))
      .innerJoin(schema.curricula, eq(schema.courses.curriculumId, schema.curricula.id))
      .where(eq(schema.enrollments.userId, userId))
      .limit(1);
    return row?.name ?? null;
  }

  @UseGuards(JwtAuthGuard)
  @Query(() => AuthUserType)
  async me(@CurrentUser() user: JwtPayload): Promise<AuthUserType> {
    const [row] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, user.sub), isNull(schema.users.deletedAt)))
      .limit(1);

    if (!row) throw new EntityNotFoundException('User', user.sub);

    const curriculumName = await this.resolveCurriculumName(user.sub, user.roles);
    return this.toAuthUser(row, user.roles, curriculumName);
  }

  @UseGuards(JwtAuthGuard)
  @Mutation(() => AuthUserType)
  async updateProfile(
    @Args('input') input: UpdateProfileInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<AuthUserType> {
    const updates: Partial<typeof schema.users.$inferInsert> = {};
    if (input.firstName !== undefined) updates.firstName = input.firstName;
    if (input.lastName !== undefined) updates.lastName = input.lastName;
    if (input.phone !== undefined) updates.phone = input.phone || null;
    if (input.birthday !== undefined) updates.birthday = input.birthday || null;
    if (input.profession !== undefined) updates.profession = input.profession;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;

    if (Object.keys(updates).length === 0) {
      return this.me(user);
    }

    const [row] = await this.db
      .update(schema.users)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(schema.users.id, user.sub), isNull(schema.users.deletedAt)))
      .returning();

    if (!row) throw new EntityNotFoundException('User', user.sub);

    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'user',
        entityId: user.sub,
        metadata: { description: 'Perfil actualizado', fields: Object.keys(updates) },
      })
      .catch(() => {});

    const curriculumName = await this.resolveCurriculumName(user.sub, user.roles);
    return this.toAuthUser(row, user.roles, curriculumName);
  }

  /** Sesiones activas del usuario (refresh tokens vigentes), una por dispositivo. */
  @UseGuards(JwtAuthGuard)
  @Query(() => [SessionType])
  async mySessions(@CurrentUser() user: JwtPayload): Promise<SessionType[]> {
    const rows = await this.db
      .select({
        id: schema.refreshTokens.id,
        sessionId: schema.refreshTokens.sessionId,
        userAgent: schema.refreshTokens.userAgent,
        ipAddress: schema.refreshTokens.ipAddress,
        createdAt: schema.refreshTokens.createdAt,
        expiresAt: schema.refreshTokens.expiresAt,
      })
      .from(schema.refreshTokens)
      .where(
        and(
          eq(schema.refreshTokens.userId, user.sub),
          isNull(schema.refreshTokens.revokedAt),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.refreshTokens.createdAt));

    // La sesión actual es aquella cuyo sessionId coincide con el del JWT en uso.
    // Fiable y estable entre rotaciones (no depende de IP/UA).
    return rows.map((r) => ({
      id: r.id,
      userAgent: r.userAgent,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      current: user.sessionId != null && r.sessionId === user.sessionId,
    }));
  }

  /** Revoca una sesión concreta del usuario (cerrar sesión en un dispositivo). */
  @UseGuards(JwtAuthGuard)
  @Mutation(() => Boolean)
  async revokeSession(@Args('id') id: string, @CurrentUser() user: JwtPayload): Promise<boolean> {
    const [row] = await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.refreshTokens.id, id),
          eq(schema.refreshTokens.userId, user.sub),
          isNull(schema.refreshTokens.revokedAt),
        ),
      )
      .returning({ id: schema.refreshTokens.id });

    if (row) {
      await this.audit
        .log({
          userId: user.sub,
          action: 'update',
          entityType: 'session',
          entityId: id,
          metadata: { description: 'Sesión revocada' },
        })
        .catch(() => {});
    }

    return !!row;
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Mutation(() => Boolean)
  async changePassword(
    @Args('input') input: ChangePasswordInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({
        id: schema.users.id,
        passwordHash: schema.users.passwordHash,
        status: schema.users.status,
      })
      .from(schema.users)
      .where(and(eq(schema.users.id, user.sub), isNull(schema.users.deletedAt)))
      .limit(1);

    if (!row) throw new EntityNotFoundException('User', user.sub);

    const valid = await this.hasher.compare(input.currentPassword, row.passwordHash);
    if (!valid) throw new UnauthorizedDomainException('La contraseña actual es incorrecta');

    const newHash = await this.hasher.hash(input.newPassword);
    await this.db
      .update(schema.users)
      .set({
        passwordHash: newHash,
        // Primer cambio: libera la cuenta y desactiva el cambio forzado.
        mustChangePassword: false,
        status: row.status === 'pending' ? 'active' : row.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.sub));

    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'user',
        entityId: user.sub,
        metadata: { description: 'Contraseña cambiada' },
      })
      .catch(() => {});

    return true;
  }
}
