import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

export interface GradeWeights {
  examWeight: number;
  practiceWeight: number;
  activityWeight: number;
}

export interface FinalGradeRow {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  examAvg: number | null;
  practiceAvg: number | null;
  activityAvg: number | null;
  finalGrade: number | null;
}

const DEFAULT_WEIGHTS: GradeWeights = {
  examWeight: 40,
  practiceWeight: 30,
  activityWeight: 30,
};

/** Promedio simple de una lista de porcentajes (0–100); null si está vacía. */
function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

@Injectable()
export class DrizzleFinalGradeRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Pesos del curso; devuelve los valores por defecto (40/30/30) si no existen. */
  async getWeights(courseId: string): Promise<GradeWeights> {
    const [row] = await this.db
      .select()
      .from(schema.courseGradeWeights)
      .where(eq(schema.courseGradeWeights.courseId, courseId))
      .limit(1);
    if (!row) return { ...DEFAULT_WEIGHTS };
    return {
      examWeight: Number(row.examWeight),
      practiceWeight: Number(row.practiceWeight),
      activityWeight: Number(row.activityWeight),
    };
  }

  /** Crea o actualiza los pesos del curso. */
  async setWeights(courseId: string, weights: GradeWeights): Promise<GradeWeights> {
    const values = {
      courseId,
      examWeight: String(weights.examWeight),
      practiceWeight: String(weights.practiceWeight),
      activityWeight: String(weights.activityWeight),
      updatedAt: new Date(),
    };
    await this.db
      .insert(schema.courseGradeWeights)
      .values(values)
      .onConflictDoUpdate({
        target: schema.courseGradeWeights.courseId,
        set: {
          examWeight: values.examWeight,
          practiceWeight: values.practiceWeight,
          activityWeight: values.activityWeight,
          updatedAt: values.updatedAt,
        },
      });
    return this.getWeights(courseId);
  }

  /**
   * Nota final ponderada por categoría para cada estudiante matriculado (activo).
   * - Exámenes: promedio del % del MEJOR intento de cada evaluación rendida.
   * - Prácticas / Actividades: promedio de (score/maxScore*100) de las notas de
   *   actividades de esa categoría (las notas manuales sin actividad = 'actividad').
   * - Nota final: Σ(promedioCategoría × peso) / Σ(pesos de categorías CON notas),
   *   de modo que las categorías aún sin notas no penalizan el resultado parcial.
   */
  async computeCourseFinalGrades(courseId: string): Promise<FinalGradeRow[]> {
    const weights = await this.getWeights(courseId);

    const students = await this.db
      .select({
        enrollmentId: schema.enrollments.id,
        studentId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.enrollments.userId, schema.users.id))
      .where(
        and(eq(schema.enrollments.courseId, courseId), eq(schema.enrollments.status, 'active')),
      );

    // Notas manuales / de actividades, con su categoría (null = 'actividad').
    const gradeRows = await this.db
      .select({
        studentId: schema.grades.studentId,
        score: schema.grades.score,
        maxScore: schema.grades.maxScore,
        category: sql<string>`coalesce(${schema.courseActivities.category}, 'actividad')`,
      })
      .from(schema.grades)
      .leftJoin(schema.courseActivities, eq(schema.grades.activityId, schema.courseActivities.id))
      .where(eq(schema.grades.courseId, courseId));

    // Intentos de examen enviados (para el mejor % por evaluación).
    const examRows = await this.db
      .select({
        studentId: schema.evaluationAttempts.studentId,
        evaluationId: schema.evaluationAttempts.evaluationId,
        percentage: schema.evaluationAttempts.percentage,
      })
      .from(schema.evaluationAttempts)
      .innerJoin(
        schema.evaluations,
        eq(schema.evaluationAttempts.evaluationId, schema.evaluations.id),
      )
      .where(
        and(
          eq(schema.evaluations.courseId, courseId),
          isNotNull(schema.evaluationAttempts.submittedAt),
        ),
      );

    // Agrupar prácticas/actividades por estudiante.
    const practiceByStudent = new Map<string, number[]>();
    const activityByStudent = new Map<string, number[]>();
    for (const g of gradeRows) {
      const max = Number(g.maxScore);
      if (!(max > 0)) continue;
      const pct = (Number(g.score) / max) * 100;
      const bucket = g.category === 'practica' ? practiceByStudent : activityByStudent;
      const list = bucket.get(g.studentId) ?? [];
      list.push(pct);
      bucket.set(g.studentId, list);
    }

    // Mejor % por (estudiante, evaluación) → luego promedio por estudiante.
    const bestExam = new Map<string, Map<string, number>>();
    for (const e of examRows) {
      if (e.percentage == null) continue;
      const pct = Number(e.percentage);
      const perEval = bestExam.get(e.studentId) ?? new Map<string, number>();
      const prev = perEval.get(e.evaluationId);
      if (prev == null || pct > prev) perEval.set(e.evaluationId, pct);
      bestExam.set(e.studentId, perEval);
    }

    return students.map((s) => {
      const examAvg = bestExam.has(s.studentId)
        ? avg([...bestExam.get(s.studentId)!.values()])
        : null;
      const practiceAvg = avg(practiceByStudent.get(s.studentId) ?? []);
      const activityAvg = avg(activityByStudent.get(s.studentId) ?? []);

      const parts: Array<[number, number]> = [];
      if (examAvg != null) parts.push([examAvg, weights.examWeight]);
      if (practiceAvg != null) parts.push([practiceAvg, weights.practiceWeight]);
      if (activityAvg != null) parts.push([activityAvg, weights.activityWeight]);
      const wsum = parts.reduce((sum, [, w]) => sum + w, 0);
      const finalGrade = wsum > 0 ? parts.reduce((sum, [v, w]) => sum + v * w, 0) / wsum : null;

      return {
        enrollmentId: s.enrollmentId,
        studentId: s.studentId,
        studentName: `${s.firstName} ${s.lastName}`.trim(),
        avatarUrl: s.avatarUrl ?? null,
        examAvg,
        practiceAvg,
        activityAvg,
        finalGrade,
      };
    });
  }

  /** Nota final de un estudiante concreto (para su propio boletín). */
  async computeStudentFinalGrade(
    courseId: string,
    studentId: string,
  ): Promise<FinalGradeRow | null> {
    const all = await this.computeCourseFinalGrades(courseId);
    return all.find((r) => r.studentId === studentId) ?? null;
  }
}
