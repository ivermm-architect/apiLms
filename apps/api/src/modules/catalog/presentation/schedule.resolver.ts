import { schema, Database } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { Inject, UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';

import { CreateScheduleInput, UpdateScheduleInput } from './dto/catalog.input';
import { CourseScheduleType } from './dto/catalog.types';

/**
 * Horarios de curso: bloques semanales (día + rango horario + aula).
 * Los EDITA el admin (COURSE_MODERATE). Los VEN docente y estudiante vía
 * `mySchedule`, filtrado a sus cursos (dictados / matriculados activos).
 * Auditado como el resto de acciones administrativas.
 */
@UseGuards(RolesGuard)
@Resolver(() => CourseScheduleType)
export class ScheduleResolver {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  /**
   * Rechaza un bloque que se cruce, el mismo día, con (a) otro bloque del mismo
   * curso o (b) otro curso que dicta el mismo docente (docente en dos aulas a la
   * vez). Horas 'HH:MM' 24h con cero a la izquierda → comparación lexicográfica
   * válida. `excludeId` omite el propio bloque al editar.
   */
  private async assertNoConflict(
    eff: { courseId: string; dayOfWeek: number; startTime: string; endTime: string },
    excludeId?: string,
  ): Promise<void> {
    if (eff.startTime >= eff.endTime) {
      throw new Error('La hora de fin debe ser posterior a la de inicio.');
    }
    const [course] = await this.db
      .select({ instructorId: schema.courses.instructorId })
      .from(schema.courses)
      .where(eq(schema.courses.id, eff.courseId))
      .limit(1);
    if (!course) throw new Error('Curso no encontrado');

    const candidates = await this.db
      .select({
        id: schema.courseSchedules.id,
        courseId: schema.courseSchedules.courseId,
        courseTitle: schema.courses.title,
        startTime: schema.courseSchedules.startTime,
        endTime: schema.courseSchedules.endTime,
      })
      .from(schema.courseSchedules)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.courseSchedules.courseId))
      .where(
        and(
          eq(schema.courseSchedules.dayOfWeek, eff.dayOfWeek),
          or(
            eq(schema.courseSchedules.courseId, eff.courseId),
            eq(schema.courses.instructorId, course.instructorId),
          ),
        ),
      );

    for (const c of candidates) {
      if (excludeId && c.id === excludeId) continue;
      const overlaps = eff.startTime < c.endTime && eff.endTime > c.startTime;
      if (!overlaps) continue;
      if (c.courseId === eff.courseId) {
        throw new Error(`Se solapa con otro bloque de este curso (${c.startTime}–${c.endTime}).`);
      }
      throw new Error(
        `El docente ya dicta «${c.courseTitle}» ese día (${c.startTime}–${c.endTime}).`,
      );
    }
  }

  /** Horarios de un curso (editor admin). Ordenados por día y hora. */
  @Query(() => [CourseScheduleType])
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async courseSchedules(@Args('courseId') courseId: string): Promise<CourseScheduleType[]> {
    const rows = await this.db
      .select()
      .from(schema.courseSchedules)
      .where(eq(schema.courseSchedules.courseId, courseId))
      .orderBy(asc(schema.courseSchedules.dayOfWeek), asc(schema.courseSchedules.startTime));
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
    }));
  }

  /**
   * Horario del usuario autenticado (docente o estudiante). Une los cursos que
   * dicta (instructor) con los que cursa (matrícula activa) y devuelve sus
   * bloques con el título del curso, ordenados por día y hora.
   */
  @Query(() => [CourseScheduleType])
  async mySchedule(@CurrentUser() actor: JwtPayload): Promise<CourseScheduleType[]> {
    // Cursos dictados (docente) — no eliminados.
    const taught = await this.db
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(and(eq(schema.courses.instructorId, actor.sub), isNull(schema.courses.deletedAt)));
    // Cursos matriculados activos (estudiante).
    const enrolled = await this.db
      .select({ id: schema.enrollments.courseId })
      .from(schema.enrollments)
      .where(
        and(eq(schema.enrollments.userId, actor.sub), eq(schema.enrollments.status, 'active')),
      );

    const courseIds = [...new Set([...taught, ...enrolled].map((c) => c.id))];
    if (courseIds.length === 0) return [];

    const rows = await this.db
      .select({
        id: schema.courseSchedules.id,
        courseId: schema.courseSchedules.courseId,
        dayOfWeek: schema.courseSchedules.dayOfWeek,
        startTime: schema.courseSchedules.startTime,
        endTime: schema.courseSchedules.endTime,
        room: schema.courseSchedules.room,
        courseTitle: schema.courses.title,
      })
      .from(schema.courseSchedules)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.courseSchedules.courseId))
      .where(inArray(schema.courseSchedules.courseId, courseIds))
      .orderBy(asc(schema.courseSchedules.dayOfWeek), asc(schema.courseSchedules.startTime));

    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
      courseTitle: r.courseTitle,
    }));
  }

  /**
   * Horario global de la institución (vista admin). Todos los bloques con su
   * curso y docente, ordenados por día y hora.
   */
  @Query(() => [CourseScheduleType])
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async allSchedules(): Promise<CourseScheduleType[]> {
    const rows = await this.db
      .select({
        id: schema.courseSchedules.id,
        courseId: schema.courseSchedules.courseId,
        dayOfWeek: schema.courseSchedules.dayOfWeek,
        startTime: schema.courseSchedules.startTime,
        endTime: schema.courseSchedules.endTime,
        room: schema.courseSchedules.room,
        courseTitle: schema.courses.title,
        instructorFirst: schema.users.firstName,
        instructorLast: schema.users.lastName,
      })
      .from(schema.courseSchedules)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.courseSchedules.courseId))
      .leftJoin(schema.users, eq(schema.users.id, schema.courses.instructorId))
      .where(isNull(schema.courses.deletedAt))
      .orderBy(asc(schema.courseSchedules.dayOfWeek), asc(schema.courseSchedules.startTime));

    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
      courseTitle: r.courseTitle,
      instructorName:
        r.instructorFirst || r.instructorLast
          ? `${r.instructorFirst ?? ''} ${r.instructorLast ?? ''}`.trim()
          : null,
    }));
  }

  /**
   * Bloques de un curso concreto para mostrarlos en su ficha. Accesible a
   * cualquier usuario autenticado (el horario no es sensible; es info de
   * catálogo). Ordenado por día y hora.
   */
  @Query(() => [CourseScheduleType])
  async courseScheduleBlocks(@Args('courseId') courseId: string): Promise<CourseScheduleType[]> {
    const rows = await this.db
      .select()
      .from(schema.courseSchedules)
      .where(eq(schema.courseSchedules.courseId, courseId))
      .orderBy(asc(schema.courseSchedules.dayOfWeek), asc(schema.courseSchedules.startTime));
    return rows.map((r) => ({
      id: r.id,
      courseId: r.courseId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      room: r.room,
    }));
  }

  @Mutation(() => CourseScheduleType)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async createSchedule(
    @Args('input') input: CreateScheduleInput,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CourseScheduleType> {
    await this.assertNoConflict({
      courseId: input.courseId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
    });
    const [row] = await this.db
      .insert(schema.courseSchedules)
      .values({
        courseId: input.courseId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        room: input.room ?? null,
      })
      .returning();

    await this.audit
      .log({
        userId: actor.sub,
        action: 'create',
        entityType: 'course_schedule',
        entityId: row!.id,
        metadata: { courseId: input.courseId, dayOfWeek: input.dayOfWeek },
      })
      .catch(() => {});

    return {
      id: row!.id,
      courseId: row!.courseId,
      dayOfWeek: row!.dayOfWeek,
      startTime: row!.startTime,
      endTime: row!.endTime,
      room: row!.room,
    };
  }

  @Mutation(() => CourseScheduleType)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async updateSchedule(
    @Args('id') id: string,
    @Args('input') input: UpdateScheduleInput,
    @CurrentUser() actor: JwtPayload,
  ): Promise<CourseScheduleType> {
    const [existing] = await this.db
      .select()
      .from(schema.courseSchedules)
      .where(eq(schema.courseSchedules.id, id))
      .limit(1);
    if (!existing) throw new Error('Horario no encontrado');

    await this.assertNoConflict(
      {
        courseId: existing.courseId,
        dayOfWeek: input.dayOfWeek ?? existing.dayOfWeek,
        startTime: input.startTime ?? existing.startTime,
        endTime: input.endTime ?? existing.endTime,
      },
      id,
    );

    const [row] = await this.db
      .update(schema.courseSchedules)
      .set({
        ...(input.dayOfWeek !== undefined ? { dayOfWeek: input.dayOfWeek } : {}),
        ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
        ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
        ...(input.room !== undefined ? { room: input.room } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.courseSchedules.id, id))
      .returning();

    if (!row) throw new Error('Horario no encontrado');

    await this.audit
      .log({
        userId: actor.sub,
        action: 'update',
        entityType: 'course_schedule',
        entityId: id,
        metadata: { ...input },
      })
      .catch(() => {});

    return {
      id: row.id,
      courseId: row.courseId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      room: row.room,
    };
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async deleteSchedule(@Args('id') id: string, @CurrentUser() actor: JwtPayload): Promise<boolean> {
    await this.db.delete(schema.courseSchedules).where(eq(schema.courseSchedules.id, id));

    await this.audit
      .log({
        userId: actor.sub,
        action: 'delete',
        entityType: 'course_schedule',
        entityId: id,
      })
      .catch(() => {});

    return true;
  }
}
