import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

export interface StudentReport {
  studentId: string;
  courseId?: string;
  avgScore: number;
  progressPercentage: number;
  lessonsCompleted: number;
  totalLessons: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

@Injectable()
export class DrizzleAnalyticsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Calcula indicadores académicos de un estudiante en un curso.
   */
  async buildStudentCourseReport(studentId: string, courseId: string): Promise<StudentReport> {
    const [enrollment] = await this.db
      .select()
      .from(schema.enrollments)
      .where(
        and(eq(schema.enrollments.userId, studentId), eq(schema.enrollments.courseId, courseId)),
      )
      .limit(1);

    if (!enrollment) {
      return {
        studentId,
        courseId,
        avgScore: 0,
        progressPercentage: 0,
        lessonsCompleted: 0,
        totalLessons: 0,
        riskLevel: 'high',
      };
    }

    const [avgResult] = await this.db
      .select({
        avgScore: sql<string>`AVG(${schema.grades.score}::numeric / ${schema.grades.maxScore}::numeric * 100)`,
      })
      .from(schema.grades)
      .where(and(eq(schema.grades.studentId, studentId), eq(schema.grades.courseId, courseId)));

    const avgScore = Number(avgResult?.avgScore ?? 0);
    const progress = Number(enrollment.progressPercentage);

    return {
      studentId,
      courseId,
      avgScore,
      progressPercentage: progress,
      lessonsCompleted: enrollment.lessonsCompleted,
      totalLessons: enrollment.totalLessons,
      riskLevel: this.computeRiskLevel(avgScore, progress),
    };
  }

  private computeRiskLevel(
    avgScore: number,
    progress: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (avgScore < 40 || progress < 20) return 'critical';
    if (avgScore < 60 || progress < 40) return 'high';
    if (avgScore < 75 || progress < 60) return 'medium';
    return 'low';
  }

  async saveReport(input: StudentReport & { periodStart: Date; periodEnd: Date }) {
    const [row] = await this.db
      .insert(schema.reports)
      .values({
        studentId: input.studentId,
        courseId: input.courseId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        avgScore: String(input.avgScore),
        progressPercentage: String(input.progressPercentage),
        lessonsCompleted: input.lessonsCompleted,
        totalLessons: input.totalLessons,
        riskLevel: input.riskLevel,
      })
      .returning();
    return row!;
  }

  async createAlert(input: {
    studentId: string;
    courseId?: string;
    alertType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    const [row] = await this.db.insert(schema.alerts).values(input).returning();
    return row!;
  }

  async listAlerts(courseId?: string, unacknowledged = true) {
    const conds = [];
    if (courseId) conds.push(eq(schema.alerts.courseId, courseId));
    if (unacknowledged) conds.push(sql`${schema.alerts.acknowledgedAt} IS NULL`);

    let query = this.db.select().from(schema.alerts);
    if (conds.length > 0) query = query.where(and(...conds)) as typeof query;
    return query.orderBy(desc(schema.alerts.createdAt)).limit(100);
  }

  /** Claves de alertas abiertas (sin acknowledge) para deduplicar al detectar. */
  async openAlertKeys(): Promise<Set<string>> {
    const rows = await this.db
      .select({
        studentId: schema.alerts.studentId,
        courseId: schema.alerts.courseId,
        alertType: schema.alerts.alertType,
      })
      .from(schema.alerts)
      .where(sql`${schema.alerts.acknowledgedAt} IS NULL`);
    return new Set(rows.map((r) => `${r.studentId}:${r.courseId ?? ''}:${r.alertType}`));
  }

  async acknowledgeAlert(id: string, userId: string) {
    await this.db
      .update(schema.alerts)
      .set({ acknowledgedAt: new Date(), acknowledgedBy: userId })
      .where(eq(schema.alerts.id, id));
  }

  /**
   * Vista agregada del dashboard admin: KPIs, deltas 30d, series mensuales,
   * top cursos y signups recientes. Una llamada -> todo lo necesario.
   */
  async getAdminDashboardOverview() {
    const [
      [userCount],
      [courseCounts],
      [enrollmentCount],
      [usersDelta],
      [roleCounts],
      enrollmentsByGestionRaw,
      topCoursesRaw,
      recentSignupsRaw,
      coursesAtRiskRaw,
    ] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(schema.users)
        .where(eq(schema.users.status, 'active')),
      this.db
        .select({
          published: sql<number>`count(*) filter (where ${schema.courses.status} = 'published')::int`,
          draft: sql<number>`count(*) filter (where ${schema.courses.status} = 'draft')::int`,
          noInstructor: sql<number>`count(*) filter (where ${schema.courses.instructorId} is null)::int`,
        })
        .from(schema.courses)
        .where(sql`${schema.courses.deletedAt} is null`),
      this.db
        .select({ total: count() })
        .from(schema.enrollments)
        .where(eq(schema.enrollments.status, 'active')),
      // Altas de usuario en la gestión (año calendario) en curso. Cadencia anual,
      // no ventana móvil de 30d (que no mapea a un instituto de matrícula anual).
      this.db
        .select({ newUsers: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(sql`extract(year from ${schema.users.createdAt}) = extract(year from now())`),
      // Recursos: plantel activo por rol (para ratio alumno/docente).
      this.db
        .select({
          students: sql<number>`count(distinct ${schema.users.id}) filter (where ${schema.roles.name} = 'student')::int`,
          teachers: sql<number>`count(distinct ${schema.users.id}) filter (where ${schema.roles.name} = 'teacher')::int`,
        })
        .from(schema.users)
        .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .where(eq(schema.users.status, 'active')),
      // Matrícula por gestión: alumnos distintos con matrícula en cada año
      // calendario (extract year de enrolled_at). Serie histórica del instituto.
      this.db
        .select({
          gestion: sql<number>`extract(year from ${schema.enrollments.enrolledAt})::int`,
          count: sql<number>`count(distinct ${schema.enrollments.userId})::int`,
        })
        .from(schema.enrollments)
        .groupBy(sql`extract(year from ${schema.enrollments.enrolledAt})`)
        .orderBy(sql`extract(year from ${schema.enrollments.enrolledAt})`),
      this.db
        .select({
          id: schema.courses.id,
          title: schema.courses.title,
          instructorFirstName: schema.users.firstName,
          instructorLastName: schema.users.lastName,
          totalStudents: schema.courses.totalStudents,
        })
        .from(schema.courses)
        .innerJoin(schema.users, eq(schema.users.id, schema.courses.instructorId))
        .where(
          and(eq(schema.courses.status, 'published'), sql`${schema.courses.deletedAt} is null`),
        )
        .orderBy(desc(schema.courses.totalStudents))
        .limit(5),
      this.db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          email: schema.users.email,
          avatarUrl: schema.users.avatarUrl,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt))
        .limit(8),
      // Cursos con riesgo sistémico: mayor % de alumnos distintos con ≥1 competencia
      // en riesgo. Es un indicador de RECURSOS (¿docente sobrecargado? ¿malla?), no
      // de seguimiento nominal — eso vive en el dashboard docente.
      this.db
        .select({
          id: schema.courses.id,
          title: schema.courses.title,
          instructorFirstName: schema.users.firstName,
          instructorLastName: schema.users.lastName,
          atRisk: sql<number>`count(distinct ${schema.competencyProgress.userId}) filter (where ${schema.competencyProgress.status} = 'en_riesgo')::int`,
          tracked: sql<number>`count(distinct ${schema.competencyProgress.userId})::int`,
        })
        .from(schema.courses)
        .innerJoin(schema.competencies, eq(schema.competencies.courseId, schema.courses.id))
        .innerJoin(
          schema.competencyProgress,
          eq(schema.competencyProgress.competencyId, schema.competencies.id),
        )
        .leftJoin(schema.users, eq(schema.users.id, schema.courses.instructorId))
        .where(sql`${schema.courses.deletedAt} is null`)
        .groupBy(
          schema.courses.id,
          schema.courses.title,
          schema.users.firstName,
          schema.users.lastName,
        )
        .having(
          sql`count(distinct ${schema.competencyProgress.userId}) filter (where ${schema.competencyProgress.status} = 'en_riesgo') > 0`,
        )
        .orderBy(
          sql`count(distinct ${schema.competencyProgress.userId}) filter (where ${schema.competencyProgress.status} = 'en_riesgo')::float / nullif(count(distinct ${schema.competencyProgress.userId}), 0) desc`,
        )
        .limit(5),
    ]);

    // Roles de los signups recientes (un solo round-trip)
    const signupIds = recentSignupsRaw.map((u) => u.id);
    const rolesByUser = new Map<string, string[]>();
    if (signupIds.length > 0) {
      const roleRows = await this.db
        .select({
          userId: schema.userRoles.userId,
          roleName: schema.roles.name,
        })
        .from(schema.userRoles)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.userRoles.roleId))
        .where(
          sql`${schema.userRoles.userId} in (${sql.join(
            signupIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`,
        );
      for (const r of roleRows) {
        const arr = rolesByUser.get(r.userId) ?? [];
        arr.push(r.roleName);
        rolesByUser.set(r.userId, arr);
      }
    }

    return {
      activeUsers: Number(userCount?.total ?? 0),
      publishedCourses: Number(courseCounts?.published ?? 0),
      draftCourses: Number(courseCounts?.draft ?? 0),
      activeEnrollments: Number(enrollmentCount?.total ?? 0),

      newUsersThisGestion: Number(usersDelta?.newUsers ?? 0),

      totalStudents: Number(roleCounts?.students ?? 0),
      totalTeachers: Number(roleCounts?.teachers ?? 0),
      coursesWithoutInstructor: Number(courseCounts?.noInstructor ?? 0),

      enrollmentsByGestion: enrollmentsByGestionRaw.map((r) => ({
        gestion: Number(r.gestion),
        count: Number(r.count),
      })),
      topCoursesByStudents: topCoursesRaw.map((c) => ({
        id: c.id,
        title: c.title,
        instructorName: `${c.instructorFirstName} ${c.instructorLastName}`.trim(),
        totalStudents: Number(c.totalStudents),
      })),
      recentSignups: recentSignupsRaw.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        avatarUrl: u.avatarUrl ?? null,
        roles: rolesByUser.get(u.id) ?? [],
        createdAt: u.createdAt,
      })),

      coursesAtRisk: coursesAtRiskRaw.map((c) => {
        const atRisk = Number(c.atRisk ?? 0);
        const tracked = Number(c.tracked ?? 0);
        return {
          id: c.id,
          title: c.title,
          instructorName:
            `${c.instructorFirstName ?? ''} ${c.instructorLastName ?? ''}`.trim() || 'Sin docente',
          atRiskStudents: atRisk,
          trackedStudents: tracked,
          riskRatio: tracked > 0 ? atRisk / tracked : 0,
        };
      }),
    };
  }

  /**
   * Reporte por cohorte (año de ingreso del estudiante, users.cohortYear).
   * Indicadores agregados de resultado por cohorte, para lectura institucional.
   *
   * Se calcula con consultas separadas por métrica (evita el fan-out de joins de
   * distinta cardinalidad) y se combina en memoria por cohortYear.
   */
  async getCohortReport(): Promise<
    Array<{
      cohortYear: number;
      studentCount: number;
      avgProgress: number;
      avgMastery: number;
      atRiskStudents: number;
    }>
  > {
    const [counts, progress, mastery] = await Promise.all([
      // Alumnos por cohorte (cohortYear no nulo = estudiante, no borrado).
      this.db
        .select({
          cohortYear: schema.users.cohortYear,
          students: sql<number>`count(distinct ${schema.users.id})::int`,
        })
        .from(schema.users)
        .where(
          and(sql`${schema.users.cohortYear} is not null`, sql`${schema.users.deletedAt} is null`),
        )
        .groupBy(schema.users.cohortYear),
      // Progreso medio de matrícula por cohorte.
      this.db
        .select({
          cohortYear: schema.users.cohortYear,
          avgProgress: sql<string>`avg(${schema.enrollments.progressPercentage}::numeric)`,
        })
        .from(schema.enrollments)
        .innerJoin(schema.users, eq(schema.users.id, schema.enrollments.userId))
        .where(sql`${schema.users.cohortYear} is not null`)
        .groupBy(schema.users.cohortYear),
      // Dominio medio y alumnos en riesgo por cohorte.
      this.db
        .select({
          cohortYear: schema.users.cohortYear,
          avgMastery: sql<string>`avg(${schema.competencyProgress.mastery}::numeric)`,
          atRisk: sql<number>`count(distinct ${schema.competencyProgress.userId}) filter (where ${schema.competencyProgress.status} = 'en_riesgo')::int`,
        })
        .from(schema.competencyProgress)
        .innerJoin(schema.users, eq(schema.users.id, schema.competencyProgress.userId))
        .where(sql`${schema.users.cohortYear} is not null`)
        .groupBy(schema.users.cohortYear),
    ]);

    const progressByCohort = new Map(progress.map((r) => [Number(r.cohortYear), r]));
    const masteryByCohort = new Map(mastery.map((r) => [Number(r.cohortYear), r]));

    return counts
      .map((c) => {
        const year = Number(c.cohortYear);
        const p = progressByCohort.get(year);
        const m = masteryByCohort.get(year);
        return {
          cohortYear: year,
          studentCount: Number(c.students ?? 0),
          avgProgress: Math.round(Number(p?.avgProgress ?? 0) * 100) / 100,
          // mastery 0..1 → porcentaje 0..100 para lectura uniforme con progreso.
          avgMastery: Math.round(Number(m?.avgMastery ?? 0) * 100 * 100) / 100,
          atRiskStudents: Number(m?.atRisk ?? 0),
        };
      })
      .sort((a, b) => a.cohortYear - b.cohortYear);
  }

  /**
   * Salud del banco de ítems: cobertura de calibración del modelo TRI. Distingue
   * ítems calibrados empíricamente (canónico), con semilla de IA (cold-start) y
   * sin calibrar. Devuelve un resumen global y un desglose por curso.
   */
  async getItemBankHealth(): Promise<{
    totalItems: number;
    empiricalItems: number;
    aiPriorItems: number;
    uncalibratedItems: number;
    byCourse: Array<{
      courseId: string;
      courseTitle: string;
      totalItems: number;
      empiricalItems: number;
      aiPriorItems: number;
      uncalibratedItems: number;
    }>;
  }> {
    const empiricalExpr = sql<number>`count(*) filter (where ${schema.itemIrtParams.source} = 'empirical')::int`;
    const aiPriorExpr = sql<number>`count(*) filter (where ${schema.itemIrtParams.source} = 'ai_prior')::int`;
    const uncalibratedExpr = sql<number>`count(*) filter (where ${schema.itemIrtParams.id} is null or ${schema.itemIrtParams.source} is null)::int`;

    const [totals, perCourse] = await Promise.all([
      this.db
        .select({
          total: sql<number>`count(*)::int`,
          empirical: empiricalExpr,
          aiPrior: aiPriorExpr,
          uncalibrated: uncalibratedExpr,
        })
        .from(schema.evaluationQuestions)
        .leftJoin(
          schema.itemIrtParams,
          eq(schema.itemIrtParams.questionId, schema.evaluationQuestions.id),
        ),
      this.db
        .select({
          courseId: schema.courses.id,
          courseTitle: schema.courses.title,
          total: sql<number>`count(*)::int`,
          empirical: empiricalExpr,
          aiPrior: aiPriorExpr,
          uncalibrated: uncalibratedExpr,
        })
        .from(schema.evaluationQuestions)
        .innerJoin(
          schema.evaluations,
          eq(schema.evaluations.id, schema.evaluationQuestions.evaluationId),
        )
        .innerJoin(schema.courses, eq(schema.courses.id, schema.evaluations.courseId))
        .leftJoin(
          schema.itemIrtParams,
          eq(schema.itemIrtParams.questionId, schema.evaluationQuestions.id),
        )
        .where(sql`${schema.courses.deletedAt} is null`)
        .groupBy(schema.courses.id, schema.courses.title)
        .orderBy(desc(sql`count(*)`)),
    ]);

    const t = totals[0];
    return {
      totalItems: Number(t?.total ?? 0),
      empiricalItems: Number(t?.empirical ?? 0),
      aiPriorItems: Number(t?.aiPrior ?? 0),
      uncalibratedItems: Number(t?.uncalibrated ?? 0),
      byCourse: perCourse.map((c) => ({
        courseId: c.courseId,
        courseTitle: c.courseTitle,
        totalItems: Number(c.total ?? 0),
        empiricalItems: Number(c.empirical ?? 0),
        aiPriorItems: Number(c.aiPrior ?? 0),
        uncalibratedItems: Number(c.uncalibrated ?? 0),
      })),
    };
  }
}
