import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import {
  CandidateCourse,
  normalizeCompetencyKey,
  WeakCompetency,
  WEAK_MASTERY_THRESHOLD,
} from '../domain/recommendation';

@Injectable()
export class DrizzleRecommendationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Competencias con bajo desempeño (< umbral) del estudiante, derivado de sus
   * calificaciones: por cada competencia se promedia la fracción de puntos
   * obtenidos (0..1) en las preguntas evaluadas que la miden. La clave
   * normalizada permite emparejar la misma competencia aunque viva en cursos
   * distintos.
   */
  async getWeakCompetencies(userId: string): Promise<WeakCompetency[]> {
    const rows = await this.db
      .select({
        name: schema.competencies.name,
        mastery: sql<string>`avg(${schema.evaluationAnswers.pointsEarned} / nullif(${schema.evaluationQuestions.points}, 0))`,
      })
      .from(schema.evaluationAnswers)
      .innerJoin(
        schema.evaluationAttempts,
        eq(schema.evaluationAttempts.id, schema.evaluationAnswers.attemptId),
      )
      .innerJoin(
        schema.evaluationQuestions,
        eq(schema.evaluationQuestions.id, schema.evaluationAnswers.questionId),
      )
      .innerJoin(
        schema.questionCompetencies,
        eq(schema.questionCompetencies.questionId, schema.evaluationQuestions.id),
      )
      .innerJoin(
        schema.competencies,
        eq(schema.competencies.id, schema.questionCompetencies.competencyId),
      )
      .where(
        and(
          eq(schema.evaluationAttempts.studentId, userId),
          isNotNull(schema.evaluationAttempts.submittedAt),
          isNotNull(schema.evaluationAnswers.isCorrect),
        ),
      )
      .groupBy(schema.competencies.name);

    return rows
      .map((r) => ({
        key: normalizeCompetencyKey(r.name),
        name: r.name,
        mastery: Number(r.mastery),
      }))
      .filter((c) => c.mastery < WEAK_MASTERY_THRESHOLD);
  }

  /** Ids de cursos en los que el estudiante ya está inscrito (para excluirlos). */
  async getEnrolledCourseIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ courseId: schema.enrollments.courseId })
      .from(schema.enrollments)
      .where(eq(schema.enrollments.userId, userId));
    return rows.map((r) => r.courseId);
  }

  /**
   * Cursos publicados, no borrados y no inscritos por el estudiante, junto con
   * las competencias que desarrollan. Un curso puede repetir filas por cada
   * competencia; se agregan en memoria a la forma `CandidateCourse`.
   */
  async getCandidateCourses(excludeCourseIds: string[]): Promise<CandidateCourse[]> {
    const conds = [eq(schema.courses.status, 'published'), isNull(schema.courses.deletedAt)];
    if (excludeCourseIds.length > 0) {
      conds.push(
        sql`${schema.courses.id} not in (${sql.join(
          excludeCourseIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    }

    const rows = await this.db
      .select({
        courseId: schema.courses.id,
        slug: schema.courses.slug,
        title: schema.courses.title,
        subtitle: schema.courses.subtitle,
        coverUrl: schema.courses.coverImageUrl,
        level: schema.courses.level,
        totalStudents: schema.courses.totalStudents,
        competencyName: schema.competencies.name,
      })
      .from(schema.courses)
      .leftJoin(schema.competencies, eq(schema.competencies.courseId, schema.courses.id))
      .where(and(...conds));

    const byCourse = new Map<string, CandidateCourse>();
    for (const r of rows) {
      let course = byCourse.get(r.courseId);
      if (!course) {
        course = {
          courseId: r.courseId,
          slug: r.slug,
          title: r.title,
          subtitle: r.subtitle ?? null,
          coverUrl: r.coverUrl ?? null,
          level: r.level,
          totalStudents: r.totalStudents,
          competencies: [],
        };
        byCourse.set(r.courseId, course);
      }
      if (r.competencyName) {
        course.competencies.push({
          key: normalizeCompetencyKey(r.competencyName),
          name: r.competencyName,
        });
      }
    }
    return [...byCourse.values()];
  }
}
