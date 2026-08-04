import { Database } from '@cieba/db';
import { schema } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { Inject, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { EnrollmentAlreadyExistsException } from '../../../shared/exceptions/domain.exception';
import { DATABASE } from '../../../core/database/database.module';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { Public } from '../../auth/infrastructure/decorators/public.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { EnrollCommand } from '../application/commands/enroll.command';
import {
  TrackLessonViewCommand,
  TrackLessonViewResult,
} from '../application/commands/track-lesson-view.command';
import { MyEnrollmentsQuery } from '../application/queries/my-enrollments.query';

import { AdminEnrollYearInput, TrackLessonViewInput } from './dto/enrollment.input';
import {
  CourseStudentType,
  EnrollmentCertificateType,
  EnrollmentType,
  EnrollYearResultType,
  TrackLessonViewResultType,
  UserEnrollmentType,
} from './dto/enrollment.types';

@UseGuards(JwtAuthGuard)
@Resolver()
export class EnrollmentResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  @Query(() => [EnrollmentType])
  async myEnrollments(@CurrentUser() user: JwtPayload): Promise<EnrollmentType[]> {
    const rows = await this.queryBus.execute(new MyEnrollmentsQuery(user.sub));
    return rows as EnrollmentType[];
  }

  /**
   * Matriculación institucional por año: la oficina (admin) inscribe a un
   * estudiante en TODAS las materias publicadas del año académico indicado.
   * Idempotente: salta las materias que el estudiante ya tenía.
   */
  @Mutation(() => EnrollYearResultType)
  @RequirePermissions(PERMISSIONS.ENROLLMENT_MANAGE)
  async adminEnrollStudentInYear(
    @Args('input') input: AdminEnrollYearInput,
    @CurrentUser() actor: JwtPayload,
  ): Promise<EnrollYearResultType> {
    const courses = await this.db
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(
        and(
          eq(schema.courses.academicYear, input.academicYear),
          eq(schema.courses.status, 'published'),
          isNull(schema.courses.deletedAt),
        ),
      );

    let enrolled = 0;
    let skipped = 0;
    for (const course of courses) {
      try {
        await this.commandBus.execute(new EnrollCommand(input.userId, course.id));
        enrolled += 1;
      } catch (e) {
        if (e instanceof EnrollmentAlreadyExistsException) {
          skipped += 1;
        } else {
          throw e;
        }
      }
    }

    await this.audit
      .log({
        userId: actor.sub,
        action: 'create',
        entityType: 'enrollment',
        entityId: input.userId,
        metadata: {
          description: `Matrícula por año ${input.academicYear}: ${enrolled} inscritas, ${skipped} ya existentes`,
          academicYear: input.academicYear,
          studentId: input.userId,
          enrolled,
          skipped,
        },
      })
      .catch(() => {});

    return { enrolled, skipped, total: courses.length, academicYear: input.academicYear };
  }

  /**
   * Desmatricular: borra la inscripción (hard delete, cascada a lesson_progress).
   * Acción de oficina para corregir altas erróneas.
   */
  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.ENROLLMENT_MANAGE)
  async adminUnenroll(
    @Args('enrollmentId') enrollmentId: string,
    @CurrentUser() actor: JwtPayload,
  ): Promise<boolean> {
    await this.db.delete(schema.enrollments).where(eq(schema.enrollments.id, enrollmentId));
    await this.audit
      .log({
        userId: actor.sub,
        action: 'delete',
        entityType: 'enrollment',
        entityId: enrollmentId,
        metadata: { description: 'Desmatriculación', enrollmentId },
      })
      .catch(() => {});
    return true;
  }

  /**
   * Inscripciones de un usuario (para su ficha en admin), con título y año del
   * curso. Ordenadas por fecha de matrícula descendente.
   */
  @Query(() => [UserEnrollmentType])
  @RequirePermissions(PERMISSIONS.ENROLLMENT_MANAGE)
  async userEnrollments(@Args('userId') userId: string): Promise<UserEnrollmentType[]> {
    const rows = await this.db
      .select({
        enrollmentId: schema.enrollments.id,
        courseId: schema.courses.id,
        courseTitle: schema.courses.title,
        academicYear: schema.courses.academicYear,
        status: schema.enrollments.status,
        progressPercentage: schema.enrollments.progressPercentage,
        lessonsCompleted: schema.enrollments.lessonsCompleted,
        totalLessons: schema.enrollments.totalLessons,
        enrolledAt: schema.enrollments.enrolledAt,
        completedAt: schema.enrollments.completedAt,
      })
      .from(schema.enrollments)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
      .where(eq(schema.enrollments.userId, userId))
      .orderBy(desc(schema.enrollments.enrolledAt));

    return rows.map((r) => ({ ...r, completedAt: r.completedAt ?? null }));
  }

  @Mutation(() => TrackLessonViewResultType)
  async trackLessonView(
    @Args('input') input: TrackLessonViewInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<TrackLessonViewResult> {
    return this.commandBus.execute(
      new TrackLessonViewCommand(
        user.sub,
        input.enrollmentId,
        input.lessonId,
        input.isCompleted,
      ),
    );
  }

  /**
   * Lista los estudiantes inscritos en un curso del docente autenticado,
   * con info del usuario y progreso. Solo el dueño del curso o admin.
   */
  @Query(() => [CourseStudentType])
  async courseStudents(
    @Args('courseId') courseId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseStudentType[]> {
    if (!user.roles.includes('admin')) {
      const [course] = await this.db
        .select({ instructorId: schema.courses.instructorId })
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);
      if (!course) return [];
      if (course.instructorId !== user.sub) {
        throw new Error('No autorizado: este curso no te pertenece');
      }
    }

    const rows = await this.db
      .select({
        enrollmentId: schema.enrollments.id,
        userId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        status: schema.enrollments.status,
        progressPercentage: schema.enrollments.progressPercentage,
        lessonsCompleted: schema.enrollments.lessonsCompleted,
        totalLessons: schema.enrollments.totalLessons,
        enrolledAt: schema.enrollments.enrolledAt,
        completedAt: schema.enrollments.completedAt,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.userId))
      .where(eq(schema.enrollments.courseId, courseId));

    return rows.map((r) => ({
      ...r,
      avatarUrl: r.avatarUrl ?? null,
      completedAt: r.completedAt ?? null,
    }));
  }

  /**
   * Verifica un certificado por código (= enrollment.id) — público, sin auth.
   * Devuelve null si el certificado no existe o el curso no está completado.
   * Permite que cualquier persona valide la autenticidad del certificado.
   */
  @Public()
  @Query(() => EnrollmentCertificateType, { nullable: true })
  async verifyCertificate(@Args('code') code: string): Promise<EnrollmentCertificateType | null> {
    const [row] = await this.db
      .select({
        enrollmentId: schema.enrollments.id,
        completedAt: schema.enrollments.completedAt,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        courseTitle: schema.courses.title,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.userId))
      .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
      .where(and(eq(schema.enrollments.id, code), eq(schema.enrollments.status, 'completed')))
      .limit(1);

    if (!row || !row.completedAt) return null;

    return {
      id: row.enrollmentId,
      code: row.enrollmentId,
      studentName: `${row.firstName} ${row.lastName}`,
      courseTitle: row.courseTitle,
      issuedAt: row.completedAt,
      valid: true,
    };
  }
}
