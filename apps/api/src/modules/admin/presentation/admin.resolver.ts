import { schema, Database } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  Args,
  Field,
  GraphQLISODateTime,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { GraphQLJSON } from 'graphql-scalars';

import { DATABASE } from '../../../core/database/database.module';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { DrizzleAuditRepository } from '../infrastructure/drizzle-audit.repository';
import { DrizzleSystemConfigRepository } from '../infrastructure/drizzle-config.repository';

@ObjectType()
class AuditLogType {
  @Field() id!: string;
  @Field(() => String, { nullable: true }) userId?: string | null;
  @Field() action!: string;
  @Field() severity!: string;
  @Field(() => String, { nullable: true }) actorName?: string | null;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field(() => String, { nullable: true }) entityType?: string | null;
  @Field(() => String, { nullable: true }) entityId?: string | null;
  @Field(() => String, { nullable: true }) ipAddress?: string | null;
  @Field(() => String, { nullable: true }) userAgent?: string | null;
  @Field(() => GraphQLJSON, { nullable: true }) metadata?: Record<string, unknown> | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
class RoleType {
  @Field() id!: string;
  @Field() name!: string;
  @Field(() => String, { nullable: true }) description?: string | null;
  @Field() isSystem!: boolean;
  /** Códigos de permiso reales del rol (role_permissions ⋈ permissions). */
  @Field(() => [String]) permissions!: string[];
}

@ObjectType()
class AdminUserType {
  @Field() id!: string;
  @Field() email!: string;
  @Field() firstName!: string;
  @Field() lastName!: string;
  @Field(() => String, { nullable: true }) documentId?: string | null;
  @Field(() => String, { nullable: true }) studentCode?: string | null;
  @Field(() => String, { nullable: true }) avatarUrl?: string | null;
  @Field(() => String, { nullable: true }) profession?: string | null;
  @Field(() => String, { nullable: true }) phone?: string | null;
  @Field(() => Int, { nullable: true }) cohortYear?: number | null;
  @Field() status!: string;
  @Field(() => [String]) roles!: string[];
  @Field(() => Int) enrollmentsCount!: number;
  @Field(() => Int) coursesCreatedCount!: number;
  @Field(() => GraphQLISODateTime, { nullable: true }) lastLoginAt?: Date | null;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
}

@ObjectType()
class AdminUserListType {
  @Field(() => [AdminUserType]) items!: AdminUserType[];
  @Field(() => Int) total!: number;
}

@ObjectType()
class AdminCourseType {
  @Field() id!: string;
  @Field() slug!: string;
  @Field() title!: string;
  @Field(() => String, { nullable: true }) subtitle?: string | null;
  @Field(() => String, { nullable: true }) coverImageUrl?: string | null;
  @Field() status!: string;
  @Field() level!: string;
  @Field(() => Int) academicYear!: number;
  @Field(() => Int) totalLessons!: number;
  @Field(() => Int) totalStudents!: number;
  @Field() instructorId!: string;
  @Field() instructorName!: string;
  @Field() instructorEmail!: string;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => GraphQLISODateTime) updatedAt!: Date;
}

@ObjectType()
class AdminCourseListType {
  @Field(() => [AdminCourseType]) items!: AdminCourseType[];
  @Field(() => Int) total!: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Resolver()
export class AdminResolver {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: DrizzleAuditRepository,
    private readonly config: DrizzleSystemConfigRepository,
  ) {}

  @Query(() => [AuditLogType])
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  async auditLogs(
    @Args('userId', { nullable: true }) userId?: string,
    @Args('entityType', { nullable: true }) entityType?: string,
  ): Promise<AuditLogType[]> {
    const rows = await this.audit.list({ userId, entityType });
    const severityOf = (action: string): string =>
      ['failed_login', 'permission_denied', 'delete'].includes(action)
        ? 'warning'
        : action === 'login' || action === 'logout'
          ? 'info'
          : 'info';
    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as { description?: string };
      const name = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
      return {
        id: r.id,
        userId: r.userId,
        action: r.action,
        severity: severityOf(r.action),
        actorName: name || 'Sistema',
        description: meta.description ?? `${r.action} ${r.entityType ?? ''}`.trim(),
        entityType: r.entityType,
        entityId: r.entityId,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt,
      };
    }) as unknown as AuditLogType[];
  }

  @Query(() => [RoleType])
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async roles(): Promise<RoleType[]> {
    const roleRows = await this.db
      .select({
        id: schema.roles.id,
        name: schema.roles.name,
        description: schema.roles.description,
        isSystem: schema.roles.isSystem,
      })
      .from(schema.roles);

    // Permisos reales por rol desde la tabla puente (fuente: role_permissions).
    const permRows = await this.db
      .select({
        roleId: schema.rolePermissions.roleId,
        code: schema.permissions.code,
      })
      .from(schema.rolePermissions)
      .innerJoin(
        schema.permissions,
        eq(schema.permissions.id, schema.rolePermissions.permissionId),
      );
    const permsByRole = new Map<string, string[]>();
    for (const p of permRows) {
      const arr = permsByRole.get(p.roleId) ?? [];
      arr.push(p.code);
      permsByRole.set(p.roleId, arr);
    }

    return roleRows.map((r) => ({
      ...r,
      permissions: permsByRole.get(r.id) ?? [],
    }));
  }

  /**
   * Lista paginada de usuarios para gestión admin.
   * Filtros: search (email/nombre), role (nombre del rol), status.
   */
  @Query(() => AdminUserListType)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async adminUsers(
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('role', { type: () => String, nullable: true }) role?: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('cohortYear', { type: () => Int, nullable: true }) cohortYear?: number,
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page = 1,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 20 }) pageSize = 20,
  ): Promise<AdminUserListType> {
    const conditions = [];
    const q = (search ?? '').trim();
    if (q.length > 0) {
      conditions.push(
        or(
          ilike(schema.users.email, `%${q}%`),
          ilike(schema.users.firstName, `%${q}%`),
          ilike(schema.users.lastName, `%${q}%`),
        )!,
      );
    }
    if (status === 'active' || status === 'inactive') {
      conditions.push(eq(schema.users.status, status));
    }
    if (typeof cohortYear === 'number') {
      conditions.push(eq(schema.users.cohortYear, cohortYear));
    }

    // Si filtran por rol, primero obtenemos los user_ids con ese rol
    if (role && role.length > 0) {
      const userIdsWithRole = await this.db
        .select({ userId: schema.userRoles.userId })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .where(eq(schema.roles.name, role));
      const ids = userIdsWithRole.map((r) => r.userId);
      if (ids.length === 0) {
        return { items: [], total: 0 };
      }
      conditions.push(inArray(schema.users.id, ids));
    }

    const whereExpr = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(whereExpr);
    const total = Number(totalRows[0]?.total ?? 0);

    const usersRows = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        documentId: schema.users.documentId,
        studentCode: schema.users.studentCode,
        avatarUrl: schema.users.avatarUrl,
        profession: schema.users.profession,
        phone: schema.users.phone,
        cohortYear: schema.users.cohortYear,
        status: schema.users.status,
        lastLoginAt: schema.users.lastLoginAt,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(whereExpr)
      .orderBy(desc(schema.users.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    if (usersRows.length === 0) {
      return { items: [], total };
    }

    const userIds = usersRows.map((u) => u.id);

    // Roles por usuario
    const roleRows = await this.db
      .select({
        userId: schema.userRoles.userId,
        roleName: schema.roles.name,
      })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(inArray(schema.userRoles.userId, userIds));
    const rolesByUser = new Map<string, string[]>();
    for (const r of roleRows) {
      const arr = rolesByUser.get(r.userId) ?? [];
      arr.push(r.roleName);
      rolesByUser.set(r.userId, arr);
    }

    // Conteo de inscripciones por usuario
    const enrollmentRows = await this.db
      .select({
        userId: schema.enrollments.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.enrollments)
      .where(inArray(schema.enrollments.userId, userIds))
      .groupBy(schema.enrollments.userId);
    const enrollmentsByUser = new Map(enrollmentRows.map((r) => [r.userId, Number(r.count)]));

    // Conteo de cursos creados por usuario (instructor)
    const coursesRows = await this.db
      .select({
        instructorId: schema.courses.instructorId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.courses)
      .where(
        and(
          inArray(schema.courses.instructorId, userIds),
          sql`${schema.courses.deletedAt} is null`,
        ),
      )
      .groupBy(schema.courses.instructorId);
    const coursesByUser = new Map(coursesRows.map((r) => [r.instructorId, Number(r.count)]));

    return {
      items: usersRows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        documentId: u.documentId ?? null,
        studentCode: u.studentCode ?? null,
        avatarUrl: u.avatarUrl ?? null,
        profession: u.profession ?? null,
        phone: u.phone ?? null,
        cohortYear: u.cohortYear ?? null,
        status: u.status,
        roles: rolesByUser.get(u.id) ?? [],
        enrollmentsCount: enrollmentsByUser.get(u.id) ?? 0,
        coursesCreatedCount: coursesByUser.get(u.id) ?? 0,
        lastLoginAt: u.lastLoginAt ?? null,
        createdAt: u.createdAt,
      })),
      total,
    };
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async assignRole(
    @Args('userId') userId: string,
    @Args('roleName') roleName: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, roleName))
      .limit(1);

    if (!role) return false;

    await this.db
      .insert(schema.userRoles)
      .values({ userId, roleId: role.id })
      .onConflictDoNothing();

    await this.audit.log({
      userId: actor.sub,
      action: 'update',
      entityType: 'user_role',
      entityId: userId,
      metadata: { assignedRole: roleName },
    });

    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  async revokeRole(
    @Args('userId') userId: string,
    @Args('roleName') roleName: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    const [role] = await this.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, roleName))
      .limit(1);
    if (!role) return false;

    // Salvaguarda: no permitir auto-revocar admin si serías el último admin
    if (actor.sub === userId && roleName === 'admin') {
      const adminCountRows = await this.db
        .select({ adminCount: sql<number>`count(*)::int` })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .where(eq(schema.roles.name, 'admin'));
      const adminCount = Number(adminCountRows[0]?.adminCount ?? 0);
      if (adminCount <= 1) {
        throw new Error('No puedes revocarte el rol admin: eres el último admin del sistema.');
      }
    }

    await this.db
      .delete(schema.userRoles)
      .where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.roleId, role.id)));

    await this.audit.log({
      userId: actor.sub,
      action: 'update',
      entityType: 'user_role',
      entityId: userId,
      metadata: { revokedRole: roleName },
    });

    return true;
  }

  /**
   * Cambiar status del usuario: active | inactive.
   * Salvaguarda: no permitir auto-desactivarse.
   */
  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  async setUserStatus(
    @Args('userId') userId: string,
    @Args('status') status: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    if (!['active', 'inactive'].includes(status)) {
      throw new Error(`Status inválido: ${status}`);
    }
    if (actor.sub === userId && status !== 'active') {
      throw new Error('No puedes cambiar tu propio status a un valor no activo.');
    }

    await this.db
      .update(schema.users)
      .set({
        status: status as 'active' | 'inactive',
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    await this.audit.log({
      userId: actor.sub,
      action: 'update',
      entityType: 'user',
      entityId: userId,
      metadata: { status },
    });

    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  async setConfig(
    @Args('key') key: string,
    @Args('value') value: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    await this.config.set(key, JSON.parse(value));
    await this.audit.log({
      userId: actor.sub,
      action: 'update',
      entityType: 'system_config',
      metadata: { key },
    });
    return true;
  }

  @Query(() => String, { nullable: true })
  @RequirePermissions(PERMISSIONS.CONFIG_MANAGE)
  async getConfig(@Args('key') key: string): Promise<string | null> {
    const value = await this.config.get(key);
    return value ? JSON.stringify(value) : null;
  }

  /* ── A3: Moderación de cursos ────────────────────────────────────── */

  @Query(() => AdminCourseListType)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async adminCourses(
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('instructorId', { type: () => String, nullable: true }) instructorId?: string,
    @Args('curriculumId', { type: () => String, nullable: true }) curriculumId?: string,
    @Args('page', { type: () => Int, nullable: true, defaultValue: 1 }) page = 1,
    @Args('pageSize', { type: () => Int, nullable: true, defaultValue: 20 }) pageSize = 20,
  ): Promise<AdminCourseListType> {
    const conditions = [sql`${schema.courses.deletedAt} is null`];
    const q = (search ?? '').trim();
    if (q.length > 0) {
      conditions.push(
        or(ilike(schema.courses.title, `%${q}%`), ilike(schema.courses.slug, `%${q}%`))!,
      );
    }
    if (status === 'draft' || status === 'published' || status === 'archived') {
      conditions.push(eq(schema.courses.status, status));
    }
    if (instructorId && instructorId.length > 0) {
      conditions.push(eq(schema.courses.instructorId, instructorId));
    }
    if (curriculumId && curriculumId.length > 0) {
      conditions.push(eq(schema.courses.curriculumId, curriculumId));
    }

    const whereExpr = and(...conditions);

    const totalRows = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.courses)
      .where(whereExpr);
    const total = Number(totalRows[0]?.total ?? 0);

    const rows = await this.db
      .select({
        id: schema.courses.id,
        slug: schema.courses.slug,
        title: schema.courses.title,
        subtitle: schema.courses.subtitle,
        coverImageUrl: schema.courses.coverImageUrl,
        status: schema.courses.status,
        level: schema.courses.level,
        academicYear: schema.courses.academicYear,
        totalLessons: schema.courses.totalLessons,
        totalStudents: schema.courses.totalStudents,
        instructorId: schema.courses.instructorId,
        instructorFirstName: schema.users.firstName,
        instructorLastName: schema.users.lastName,
        instructorEmail: schema.users.email,
        createdAt: schema.courses.createdAt,
        updatedAt: schema.courses.updatedAt,
      })
      .from(schema.courses)
      .innerJoin(schema.users, eq(schema.users.id, schema.courses.instructorId))
      .where(whereExpr)
      .orderBy(desc(schema.courses.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    if (rows.length === 0) return { items: [], total };

    return {
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        subtitle: r.subtitle ?? null,
        coverImageUrl: r.coverImageUrl ?? null,
        status: r.status,
        level: r.level,
        academicYear: Number(r.academicYear),
        totalLessons: Number(r.totalLessons),
        totalStudents: Number(r.totalStudents),
        instructorId: r.instructorId,
        instructorName: `${r.instructorFirstName} ${r.instructorLastName}`.trim(),
        instructorEmail: r.instructorEmail,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
    };
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async adminArchiveCourse(
    @Args('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    await this.db
      .update(schema.courses)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(schema.courses.id, id));
    await this.audit.log({
      userId: actor.sub,
      action: 'update',
      entityType: 'course',
      entityId: id,
      metadata: { adminAction: 'archive' },
    });
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async adminSoftDeleteCourse(
    @Args('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    // Verifica si tiene inscripciones activas — bloqueo de seguridad
    const enrollments = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.courseId, id), eq(schema.enrollments.status, 'active')));
    const activeCount = Number(enrollments[0]?.count ?? 0);
    if (activeCount > 0) {
      throw new Error(
        `No se puede eliminar: ${activeCount} estudiante(s) con inscripción activa. Archiva el curso primero.`,
      );
    }
    await this.db
      .update(schema.courses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.courses.id, id));
    await this.audit.log({
      userId: actor.sub,
      action: 'delete',
      entityType: 'course',
      entityId: id,
      metadata: { adminAction: 'soft_delete' },
    });
    return true;
  }
}
