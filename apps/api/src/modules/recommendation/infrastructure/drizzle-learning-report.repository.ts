import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';
import { LearningCourseFact } from '../domain/ports/learning-report-narrator.port';

/**
 * Reúne los HECHOS reales del estudiante para el informe de aprendizaje:
 * avance por curso (inscripciones) + promedio de calificaciones por curso.
 * Sin psicometría: solo progreso observado y promedios de notas.
 */
@Injectable()
export class DrizzleLearningReportRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getStudentCourseFacts(userId: string): Promise<LearningCourseFact[]> {
    // 1) Inscripciones del estudiante con título y avance del curso.
    const enrollments = await this.db
      .select({
        courseId: schema.enrollments.courseId,
        title: schema.courses.title,
        progress: schema.enrollments.progressPercentage,
        lessonsCompleted: schema.enrollments.lessonsCompleted,
        totalLessons: schema.enrollments.totalLessons,
      })
      .from(schema.enrollments)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
      .where(eq(schema.enrollments.userId, userId));

    if (enrollments.length === 0) return [];

    // 2) Promedio de calificaciones por curso (score/maxScore*100).
    const gradeRows = await this.db
      .select({
        courseId: schema.grades.courseId,
        avgPct: sql<number>`avg(${schema.grades.score} / nullif(${schema.grades.maxScore}, 0) * 100)`,
        count: sql<number>`count(*)`,
      })
      .from(schema.grades)
      .where(eq(schema.grades.studentId, userId))
      .groupBy(schema.grades.courseId);

    const gradesByCourse = new Map<string, { avgPct: number; count: number }>();
    for (const g of gradeRows) {
      gradesByCourse.set(g.courseId, { avgPct: Number(g.avgPct), count: Number(g.count) });
    }

    return enrollments.map((e) => {
      const grade = gradesByCourse.get(e.courseId);
      return {
        title: e.title,
        progress: Math.round(Number(e.progress)),
        lessonsCompleted: e.lessonsCompleted,
        totalLessons: e.totalLessons,
        averageScore: grade ? Math.round(grade.avgPct) : null,
        gradeCount: grade ? grade.count : 0,
      };
    });
  }
}
