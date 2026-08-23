import { Database } from '@cieba/db';
import { schema } from '@cieba/db';
import { JwtPayload, PERMISSIONS } from '@cieba/shared';
import { Inject, UseGuards } from '@nestjs/common';
import { CommandBus, EventBus, QueryBus } from '@nestjs/cqrs';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { CourseOwnershipService } from '../../../core/authz/course-ownership.service';
import { DATABASE } from '../../../core/database/database.module';
import { DrizzleAuditRepository } from '../../admin/infrastructure/drizzle-audit.repository';
import { CurrentUser } from '../../auth/infrastructure/decorators/current-user.decorator';
import { Public } from '../../auth/infrastructure/decorators/public.decorator';
import { RequirePermissions } from '../../auth/infrastructure/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/infrastructure/guards/roles.guard';
import { CreateCourseCommand } from '../application/commands/create-course.command';
import { PublishCourseCommand } from '../application/commands/publish-course.command';
import { UpdateCourseCommand } from '../application/commands/update-course.command';
import { GetCourseQuery } from '../application/queries/get-course.query';
import { ListCoursesHandler, ListCoursesQuery } from '../application/queries/list-courses.query';
import { LessonPublishedEvent } from '../domain/events/lesson-published.event';
import { DrizzleLessonRepository } from '../infrastructure/drizzle-lesson.repository';
import { DrizzleSectionRepository } from '../infrastructure/drizzle-section.repository';

import {
  CreateCourseInput,
  CreateLessonInput,
  CreateSectionInput,
  ListCoursesInput,
  ReorderItemInput,
  UpdateCourseInput,
  UpdateLessonInput,
  UpdateSectionInput,
} from './dto/catalog.input';
import {
  CourseListType,
  CourseType,
  InstructorAnalyticsType,
  InstructorAtRiskStudentType,
  InstructorCourseType,
  InstructorDashboardStatsType,
  LessonType,
  SectionType,
  TopInstructorType,
} from './dto/catalog.types';

/** % mínimo de aprobación (Bolivia); por debajo cuenta como "notas bajas". */
const LOW_GRADE_THRESHOLD = 51;

@UseGuards(RolesGuard)
@Resolver(() => CourseType)
export class CatalogResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly sections: DrizzleSectionRepository,
    private readonly lessons: DrizzleLessonRepository,
    private readonly eventBus: EventBus,
    private readonly courseOwnership: CourseOwnershipService,
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: DrizzleAuditRepository,
  ) {}

  // ---------- Public queries ----------

  @Public()
  @Query(() => CourseListType)
  async courses(
    @Args('input', { nullable: true }) input?: ListCoursesInput,
  ): Promise<CourseListType> {
    const page = input?.page ?? 1;
    const pageSize = input?.pageSize ?? 20;
    const result = await this.queryBus.execute<
      ListCoursesQuery,
      Awaited<ReturnType<ListCoursesHandler['execute']>>
    >(
      new ListCoursesQuery({
        page,
        pageSize,
        filter: {
          search: input?.search,
          instructorId: input?.instructorId,
          status: input?.status ?? 'published',
          level: input?.level,
          academicYear: input?.academicYear,
        },
        sortBy: input?.sortBy as 'createdAt' | 'title' | undefined,
        sortOrder: input?.sortOrder,
      }),
    );
    return {
      items: result.items as unknown as CourseType[],
      meta: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: Math.ceil(result.total / result.pageSize),
      },
    };
  }

  @Public()
  @Query(() => CourseType)
  async course(@Args('slug') slug: string): Promise<CourseType> {
    const course = await this.queryBus.execute(new GetCourseQuery(slug, 'slug'));
    return course as CourseType;
  }

  @Public()
  @Query(() => [SectionType])
  courseSections(@Args('courseId') courseId: string): Promise<SectionType[]> {
    return this.sections.listByCourse(courseId) as unknown as Promise<SectionType[]>;
  }

  @Public()
  @Query(() => [LessonType])
  sectionLessons(@Args('sectionId') sectionId: string): Promise<LessonType[]> {
    return this.lessons.listBySection(sectionId) as unknown as Promise<LessonType[]>;
  }

  @Public()
  @Query(() => [TopInstructorType])
  async topInstructors(
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 4 }) limit?: number,
  ): Promise<TopInstructorType[]> {
    const max = Math.min(Math.max(limit ?? 4, 1), 20);

    // Agregamos cursos publicados por instructor + traemos los datos del usuario.
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        profession: schema.users.profession,
        avatarUrl: schema.users.avatarUrl,
        courseCount: sql<number>`count(${schema.courses.id})::int`,
        totalStudents: sql<number>`coalesce(sum(${schema.courses.totalStudents}), 0)::int`,
      })
      .from(schema.users)
      .innerJoin(schema.courses, eq(schema.courses.instructorId, schema.users.id))
      .where(and(eq(schema.courses.status, 'published'), isNull(schema.users.deletedAt)))
      .groupBy(
        schema.users.id,
        schema.users.firstName,
        schema.users.lastName,
        schema.users.profession,
        schema.users.avatarUrl,
      )
      .orderBy(desc(sql`count(${schema.courses.id})`))
      .limit(max);

    return rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      profession: r.profession ?? null,
      avatarUrl: r.avatarUrl ?? null,
      courseCount: Number(r.courseCount),
      totalStudents: Number(r.totalStudents),
    }));
  }

  // ---------- Instructor own data ----------

  /**
   * Cursos del docente autenticado, con métricas: ingresos acumulados
   * y total de estudiantes inscritos. Filtrable por status.
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [InstructorCourseType])
  async myInstructorCourses(
    @CurrentUser() user: JwtPayload,
    @Args('status', { nullable: true }) status?: string,
  ): Promise<InstructorCourseType[]> {
    const conditions = [
      eq(schema.courses.instructorId, user.sub),
      isNull(schema.courses.deletedAt),
    ];
    if (status === 'draft' || status === 'published' || status === 'archived') {
      conditions.push(eq(schema.courses.status, status));
    }

    const courses = await this.db
      .select()
      .from(schema.courses)
      .where(and(...conditions))
      .orderBy(desc(schema.courses.updatedAt));

    if (courses.length === 0) return [];
    const courseIds = courses.map((c) => c.id);

    // Avg progress + última actividad de los estudiantes inscritos por curso.
    const enrollmentAggRows = await this.db
      .select({
        courseId: schema.enrollments.courseId,
        avgProgress: sql<string>`coalesce(avg(${schema.enrollments.progressPercentage}::numeric), 0)::text`,
        lastActivityAt: sql<Date | null>`max(${schema.enrollments.updatedAt})`,
      })
      .from(schema.enrollments)
      .where(inArray(schema.enrollments.courseId, courseIds))
      .groupBy(schema.enrollments.courseId);
    const enrollmentAggByCourse = new Map(enrollmentAggRows.map((r) => [r.courseId, r] as const));

    // Pending grades: intentos entregados pero no calificados, agrupados por curso.
    const pendingGradesRows = await this.db
      .select({
        courseId: schema.evaluations.courseId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.evaluationAttempts)
      .innerJoin(
        schema.evaluations,
        eq(schema.evaluations.id, schema.evaluationAttempts.evaluationId),
      )
      .where(
        and(
          inArray(schema.evaluations.courseId, courseIds),
          sql`${schema.evaluationAttempts.submittedAt} is not null`,
          sql`${schema.evaluationAttempts.score} is null`,
        ),
      )
      .groupBy(schema.evaluations.courseId);
    const pendingGradesByCourse = new Map(
      pendingGradesRows.map((r) => [r.courseId, Number(r.count)]),
    );

    return courses.map((c) => {
      const agg = enrollmentAggByCourse.get(c.id);
      return {
        id: c.id,
        slug: c.slug,
        title: c.title,
        subtitle: c.subtitle ?? null,
        description: c.description,
        requirements: c.requirements ?? null,
        targetAudience: c.targetAudience ?? null,
        coverImageUrl: c.coverImageUrl ?? null,
        level: c.level,
        academicYear: c.academicYear,
        status: c.status,
        durationMinutes: c.durationMinutes,
        totalLessons: c.totalLessons,
        totalStudents: c.totalStudents,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        avgProgress: agg?.avgProgress ?? '0',
        lastActivityAt: agg?.lastActivityAt ?? null,
        pendingGradesCount: pendingGradesByCourse.get(c.id) ?? 0,
      };
    });
  }

  /**
   * Stats agregadas para el dashboard del docente.
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => InstructorDashboardStatsType)
  async instructorDashboardStats(
    @CurrentUser() user: JwtPayload,
    // Segmentación por gestión (cohortYear 1 = 1.º · 2 = 2.º). Sin valor = todas
    // las gestiones vigentes. En ambos casos se excluyen egresados (status != active).
    @Args('cohortYear', { type: () => Int, nullable: true }) cohortYear?: number,
  ): Promise<InstructorDashboardStatsType> {
    // Cursos del docente (ids + status + estudiantes) en una sola pasada.
    const myCourses = await this.db
      .select({
        id: schema.courses.id,
        status: schema.courses.status,
      })
      .from(schema.courses)
      .where(and(eq(schema.courses.instructorId, user.sub), isNull(schema.courses.deletedAt)));

    const publishedCourses = myCourses.filter((c) => c.status === 'published').length;
    const draftCourses = myCourses.filter((c) => c.status === 'draft').length;
    const courseIds = myCourses.map((c) => c.id);

    if (courseIds.length === 0) {
      return {
        publishedCourses,
        draftCourses,
        totalStudents: 0,
        pendingGradesCount: 0,
        studentsAtRisk: 0,
        inactiveStudents: 0,
      };
    }

    // Estudiantes visibles del docente: solo activos (los egresados quedan
    // 'inactive' en la matrícula por gestión, así que se excluyen de todos los
    // KPIs). Con `cohortYear` se acota además a esa gestión (1.º / 2.º).
    const visibleStudents = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.status, 'active'),
          cohortYear != null ? eq(schema.users.cohortYear, cohortYear) : undefined,
        ),
      );
    const studentIds = visibleStudents.map((r) => r.id);

    if (studentIds.length === 0) {
      return {
        publishedCourses,
        draftCourses,
        totalStudents: 0,
        pendingGradesCount: 0,
        studentsAtRisk: 0,
        inactiveStudents: 0,
      };
    }

    // Corre los agregados en paralelo; cada uno acotado a los cursos del docente
    // y a los estudiantes visibles (gestión seleccionada, sin egresados).
    const [pendingRows, riskRows, inactiveRows, uniqueRows] = await Promise.all([
      // 1. Calificaciones pendientes: intentos entregados sin score.
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.evaluationAttempts)
        .innerJoin(
          schema.evaluations,
          eq(schema.evaluations.id, schema.evaluationAttempts.evaluationId),
        )
        .where(
          and(
            inArray(schema.evaluations.courseId, courseIds),
            inArray(schema.evaluationAttempts.studentId, studentIds),
            sql`${schema.evaluationAttempts.submittedAt} is not null`,
            sql`${schema.evaluationAttempts.score} is null`,
          ),
        ),
      // 2. Estudiantes en riesgo por REGLAS (sin psicometría): inscripción activa que
      //    cumple ≥1 de — inactividad ≥7 días · entregas sin calificar · promedio de
      //    notas < umbral de aprobación. Cuenta estudiantes distintos.
      this.db
        .select({ count: sql<number>`count(distinct ${schema.enrollments.userId})::int` })
        .from(schema.enrollments)
        .where(
          and(
            inArray(schema.enrollments.courseId, courseIds),
            inArray(schema.enrollments.userId, studentIds),
            eq(schema.enrollments.status, 'active'),
            sql`(
              (${schema.enrollments.progressPercentage}::numeric < 100 and ${schema.enrollments.updatedAt} <= now() - interval '7 days')
              or exists (
                select 1 from evaluation_attempts ea
                join evaluations ev on ev.id = ea.evaluation_id
                where ea.student_id = ${schema.enrollments.userId} and ev.course_id = ${schema.enrollments.courseId}
                  and ea.submitted_at is not null and ea.score is null
              )
              or coalesce((
                select avg(g.score / nullif(g.max_score, 0) * 100)
                from grades g
                where g.student_id = ${schema.enrollments.userId} and g.course_id = ${schema.enrollments.courseId}
              ), 100) < ${LOW_GRADE_THRESHOLD}
            )`,
          ),
        ),
      // 3. Estudiantes inactivos: inscripción activa, sin completar, ≥7 días sin actividad.
      this.db
        .select({ count: sql<number>`count(distinct ${schema.enrollments.userId})::int` })
        .from(schema.enrollments)
        .where(
          and(
            inArray(schema.enrollments.courseId, courseIds),
            inArray(schema.enrollments.userId, studentIds),
            eq(schema.enrollments.status, 'active'),
            sql`${schema.enrollments.progressPercentage}::numeric < 100`,
            sql`${schema.enrollments.updatedAt} <= now() - interval '7 days'`,
          ),
        ),
      // 4. Estudiantes ÚNICOS que sigue el docente (activos + gestión). Reemplaza
      //    la suma de `courses.totalStudents`, que contaba inscripciones (mismo
      //    alumno en N cursos = N), incluía egresados y no respetaba `cohortYear`.
      this.db
        .select({ count: sql<number>`count(distinct ${schema.enrollments.userId})::int` })
        .from(schema.enrollments)
        .where(
          and(
            inArray(schema.enrollments.courseId, courseIds),
            inArray(schema.enrollments.userId, studentIds),
          ),
        ),
    ]);

    return {
      publishedCourses,
      draftCourses,
      totalStudents: Number(uniqueRows[0]?.count ?? 0),
      pendingGradesCount: Number(pendingRows[0]?.count ?? 0),
      studentsAtRisk: Number(riskRows[0]?.count ?? 0),
      inactiveStudents: Number(inactiveRows[0]?.count ?? 0),
    };
  }

  /**
   * Roster cross-curso de estudiantes en riesgo por REGLAS simples (sin psicometría):
   * inactividad ≥7 días, entregas sin calificar o promedio de notas por debajo del
   * umbral de aprobación. Drill-down del KPI "Estudiantes en riesgo". Una fila por
   * (estudiante × curso); ordena por gravedad (más motivos y menor nota primero).
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => [InstructorAtRiskStudentType])
  async instructorAtRiskStudents(
    @CurrentUser() user: JwtPayload,
  ): Promise<InstructorAtRiskStudentType[]> {
    const myCourses = await this.db
      .select({ id: schema.courses.id })
      .from(schema.courses)
      .where(and(eq(schema.courses.instructorId, user.sub), isNull(schema.courses.deletedAt)));

    const courseIds = myCourses.map((c) => c.id);
    if (courseIds.length === 0) return [];

    // Una fila por (estudiante × curso) con las señales de las 3 reglas ya calculadas
    // en SQL: inactividad, promedio de notas y entregas pendientes de calificar.
    const rows = await this.db
      .select({
        userId: schema.enrollments.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        courseId: schema.enrollments.courseId,
        courseTitle: schema.courses.title,
        lastActivityAt: schema.enrollments.updatedAt,
        inactive: sql<boolean>`(${schema.enrollments.progressPercentage}::numeric < 100 and ${schema.enrollments.updatedAt} <= now() - interval '7 days')`,
        avgGrade: sql<string | null>`(
          select avg(g.score / nullif(g.max_score, 0) * 100)
          from grades g
          where g.student_id = ${schema.enrollments.userId} and g.course_id = ${schema.enrollments.courseId}
        )`,
        pendingCount: sql<number>`(
          select count(*)::int
          from evaluation_attempts ea
          join evaluations ev on ev.id = ea.evaluation_id
          where ea.student_id = ${schema.enrollments.userId} and ev.course_id = ${schema.enrollments.courseId}
            and ea.submitted_at is not null and ea.score is null
        )`,
      })
      .from(schema.enrollments)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
      .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.userId))
      .where(
        and(
          inArray(schema.enrollments.courseId, courseIds),
          eq(schema.enrollments.status, 'active'),
          eq(schema.users.status, 'active'),
        ),
      );

    // Aplica las reglas en memoria y descarta a quien no cumple ninguna.
    const atRisk: InstructorAtRiskStudentType[] = [];
    for (const r of rows) {
      const avgGrade = r.avgGrade != null ? Math.round(Number(r.avgGrade)) : null;
      const pendingCount = Number(r.pendingCount);
      const inactive = Boolean(r.inactive);
      const lowGrades = avgGrade != null && avgGrade < LOW_GRADE_THRESHOLD;

      const reasons: string[] = [];
      if (lowGrades) reasons.push('low_grades');
      if (pendingCount > 0) reasons.push('pending_grading');
      if (inactive) reasons.push('inactivity');
      if (reasons.length === 0) continue;

      atRisk.push({
        userId: r.userId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        avatarUrl: r.avatarUrl ?? null,
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        lastActivityAt: r.lastActivityAt ?? null,
        avgGrade,
        pendingCount,
        inactive,
        reasons,
      });
    }

    // Ordena por gravedad: más motivos primero; a igualdad, menor promedio de notas.
    return atRisk.sort((a, b) => {
      if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length;
      const ga = a.avgGrade ?? 101;
      const gb = b.avgGrade ?? 101;
      return ga - gb;
    });
  }

  /**
   * Analytics agregadas para la vista del docente: series temporales,
   * top cursos y completion rate. Filtra solo cursos del docente autenticado.
   */
  @UseGuards(JwtAuthGuard)
  @Query(() => InstructorAnalyticsType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async instructorAnalytics(@CurrentUser() user: JwtPayload): Promise<InstructorAnalyticsType> {
    const myCourses = await this.db
      .select({
        id: schema.courses.id,
        title: schema.courses.title,
        totalStudents: schema.courses.totalStudents,
      })
      .from(schema.courses)
      .where(and(eq(schema.courses.instructorId, user.sub), isNull(schema.courses.deletedAt)));

    const ids = myCourses.map((c) => c.id);
    if (ids.length === 0) {
      return {
        enrollmentsByMonth: [],
        topCoursesByStudents: [],
        completionRate: '0',
        totalEnrollments: 0,
        completedEnrollments: 0,
      };
    }

    // Enrollments por mes (últimos 6 meses)
    const monthRows = await this.db
      .select({
        month: sql<string>`to_char(${schema.enrollments.enrolledAt}, 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.enrollments)
      .where(
        and(
          inArray(schema.enrollments.courseId, ids),
          sql`${schema.enrollments.enrolledAt} >= now() - interval '6 months'`,
        ),
      )
      .groupBy(sql`to_char(${schema.enrollments.enrolledAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${schema.enrollments.enrolledAt}, 'YYYY-MM') asc`);

    // Total + completed enrollments
    const [totalRow] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${schema.enrollments.status} = 'completed')::int`,
      })
      .from(schema.enrollments)
      .where(inArray(schema.enrollments.courseId, ids));

    const totalEnrollments = Number(totalRow?.total ?? 0);
    const completedEnrollments = Number(totalRow?.completed ?? 0);
    const completionRate =
      totalEnrollments > 0 ? ((completedEnrollments / totalEnrollments) * 100).toFixed(1) : '0';

    const topCourses = [...myCourses]
      .sort((a, b) => Number(b.totalStudents) - Number(a.totalStudents))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        totalStudents: Number(c.totalStudents),
      }));

    return {
      enrollmentsByMonth: monthRows.map((r) => ({
        month: r.month,
        count: Number(r.count),
      })),
      topCoursesByStudents: topCourses,
      completionRate,
      totalEnrollments,
      completedEnrollments,
    };
  }

  // ---------- Instructor/admin mutations ----------

  @Mutation(() => CourseType)
  @RequirePermissions(PERMISSIONS.COURSE_CREATE)
  async createCourse(
    @Args('input') input: CreateCourseInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseType> {
    const course = (await this.commandBus.execute(
      new CreateCourseCommand({ ...input, instructorId: input.instructorId ?? user.sub }),
    )) as CourseType;
    await this.audit
      .log({
        userId: user.sub,
        action: 'create',
        entityType: 'course',
        entityId: course.id,
        metadata: { description: `Curso creado: ${course.title}`, title: course.title },
      })
      .catch(() => {});
    return course;
  }

  @Mutation(() => CourseType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async updateCourse(
    @Args('id') id: string,
    @Args('input') input: UpdateCourseInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseType> {
    const course = (await this.commandBus.execute(
      new UpdateCourseCommand(id, user.sub, user.roles, input),
    )) as CourseType;
    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'course',
        entityId: id,
        metadata: {
          description: `Curso actualizado: ${course.title}`,
          fields: Object.keys(input),
        },
      })
      .catch(() => {});
    return course;
  }

  /**
   * Asigna o reasigna el docente responsable de un curso. Autoridad del admin
   * (COURSE_MODERATE), no del docente: gobierna la relación docente↔curso a nivel
   * institucional. Valida que el destinatario tenga rol docente. Auditado.
   */
  @Mutation(() => CourseType)
  @RequirePermissions(PERMISSIONS.COURSE_MODERATE)
  async assignCourseInstructor(
    @Args('courseId') courseId: string,
    @Args('instructorId') instructorId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseType> {
    const [teacher] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
      .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
      .where(and(eq(schema.users.id, instructorId), eq(schema.roles.name, 'teacher')))
      .limit(1);
    if (!teacher) {
      throw new Error('El usuario seleccionado no tiene rol docente');
    }

    const [row] = await this.db
      .update(schema.courses)
      .set({ instructorId, updatedAt: new Date() })
      .where(and(eq(schema.courses.id, courseId), isNull(schema.courses.deletedAt)))
      .returning();
    if (!row) throw new Error('Curso no encontrado');

    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'course',
        entityId: courseId,
        metadata: { description: `Docente asignado al curso: ${row.title}`, instructorId },
      })
      .catch(() => {});

    return row as unknown as CourseType;
  }

  @Mutation(() => CourseType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async publishCourse(
    @Args('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CourseType> {
    const course = (await this.commandBus.execute(
      new PublishCourseCommand(id, user.sub, user.roles),
    )) as CourseType;
    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'course',
        entityId: id,
        metadata: { description: `Curso publicado: ${course.title}`, status: 'published' },
      })
      .catch(() => {});
    return course;
  }

  /**
   * Cambia un curso publicado a draft. Solo el dueño o admin.
   */
  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async unpublishCourse(@Args('id') id: string, @CurrentUser() user: JwtPayload): Promise<boolean> {
    await this.courseOwnership.assertOwnership(id, user);
    await this.db
      .update(schema.courses)
      .set({ status: 'draft', publishedAt: null, updatedAt: new Date() })
      .where(eq(schema.courses.id, id));
    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'course',
        entityId: id,
        metadata: { description: 'Curso despublicado', status: 'draft' },
      })
      .catch(() => {});
    return true;
  }

  /**
   * Archiva un curso (soft hide del catálogo). Reversible cambiando status manualmente.
   */
  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async archiveCourse(@Args('id') id: string, @CurrentUser() user: JwtPayload): Promise<boolean> {
    await this.courseOwnership.assertOwnership(id, user);
    await this.db
      .update(schema.courses)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(schema.courses.id, id));
    await this.audit
      .log({
        userId: user.sub,
        action: 'update',
        entityType: 'course',
        entityId: id,
        metadata: { description: 'Curso archivado', status: 'archived' },
      })
      .catch(() => {});
    return true;
  }

  /**
   * Verifica que el curso pertenezca al docente autenticado o que sea admin.
   * Privado, no expuesto en GraphQL.
   */
  @Mutation(() => SectionType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async createSection(
    @Args('input') input: CreateSectionInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<SectionType> {
    await this.courseOwnership.assertOwnership(input.courseId, user);
    const row = await this.sections.create(input);
    return row as unknown as SectionType;
  }

  @Mutation(() => SectionType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async updateSection(
    @Args('id') id: string,
    @Args('input') input: UpdateSectionInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<SectionType> {
    await this.assertSectionOwnership(id, user);
    const row = await this.sections.update(id, input);
    return row as unknown as SectionType;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async deleteSection(@Args('id') id: string, @CurrentUser() user: JwtPayload): Promise<boolean> {
    await this.assertSectionOwnership(id, user);
    await this.sections.delete(id);
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async reorderSections(
    @Args('courseId') courseId: string,
    @Args({ name: 'items', type: () => [ReorderItemInput] }) items: ReorderItemInput[],
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.courseOwnership.assertOwnership(courseId, user);
    await this.db.transaction(async (tx) => {
      for (const it of items) {
        await tx
          .update(schema.sections)
          .set({ position: it.position, updatedAt: new Date() })
          .where(and(eq(schema.sections.id, it.id), eq(schema.sections.courseId, courseId)));
      }
    });
    return true;
  }

  @Mutation(() => LessonType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async createLesson(
    @Args('input') input: CreateLessonInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<LessonType> {
    await this.courseOwnership.assertOwnership(input.courseId, user);
    const row = await this.lessons.create(input);

    // Solo avisa a inscritos si el curso ya está publicado (no en borradores).
    const [course] = await this.db
      .select({ status: schema.courses.status })
      .from(schema.courses)
      .where(eq(schema.courses.id, input.courseId))
      .limit(1);
    if (course?.status === 'published') {
      this.eventBus.publish(new LessonPublishedEvent(row.id, input.courseId, row.title));
    }

    return row as unknown as LessonType;
  }

  @Mutation(() => LessonType)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async updateLesson(
    @Args('id') id: string,
    @Args('input') input: UpdateLessonInput,
    @CurrentUser() user: JwtPayload,
  ): Promise<LessonType> {
    await this.assertLessonOwnership(id, user);
    const row = await this.lessons.update(id, input);
    return row as unknown as LessonType;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async deleteLesson(@Args('id') id: string, @CurrentUser() user: JwtPayload): Promise<boolean> {
    await this.assertLessonOwnership(id, user);
    await this.lessons.delete(id);
    return true;
  }

  @Mutation(() => Boolean)
  @RequirePermissions(PERMISSIONS.COURSE_MANAGE)
  async reorderLessons(
    @Args('sectionId') sectionId: string,
    @Args({ name: 'items', type: () => [ReorderItemInput] }) items: ReorderItemInput[],
    @CurrentUser() user: JwtPayload,
  ): Promise<boolean> {
    await this.assertSectionOwnership(sectionId, user);
    await this.db.transaction(async (tx) => {
      for (const it of items) {
        await tx
          .update(schema.lessons)
          .set({ position: it.position, updatedAt: new Date() })
          .where(and(eq(schema.lessons.id, it.id), eq(schema.lessons.sectionId, sectionId)));
      }
    });
    return true;
  }

  /**
   * Helper: verifica que la sección pertenezca a un curso del docente.
   */
  private async assertSectionOwnership(sectionId: string, user: JwtPayload): Promise<void> {
    if (user.roles.includes('admin')) return;
    const [row] = await this.db
      .select({ courseId: schema.sections.courseId })
      .from(schema.sections)
      .where(eq(schema.sections.id, sectionId))
      .limit(1);
    if (!row) throw new Error('Section not found');
    await this.courseOwnership.assertOwnership(row.courseId, user);
  }

  /**
   * Helper: verifica que la lección pertenezca a un curso del docente.
   */
  private async assertLessonOwnership(lessonId: string, user: JwtPayload): Promise<void> {
    if (user.roles.includes('admin')) return;
    const [row] = await this.db
      .select({ courseId: schema.lessons.courseId })
      .from(schema.lessons)
      .where(eq(schema.lessons.id, lessonId))
      .limit(1);
    if (!row) throw new Error('Lesson not found');
    await this.courseOwnership.assertOwnership(row.courseId, user);
  }
}
