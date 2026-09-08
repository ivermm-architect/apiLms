import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleActivityRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.courseActivities)
      .where(eq(schema.courseActivities.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Actividades del curso + cuántos estudiantes ya tienen nota (graded) y el
   *  total de matriculados activos (para mostrar "3/12 calificados"). */
  async listByCourse(courseId: string) {
    const activities = await this.db
      .select()
      .from(schema.courseActivities)
      .where(eq(schema.courseActivities.courseId, courseId))
      .orderBy(desc(schema.courseActivities.createdAt));

    const [studentCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.enrollments)
      .where(
        and(eq(schema.enrollments.courseId, courseId), eq(schema.enrollments.status, 'active')),
      );
    const totalStudents = studentCount?.count ?? 0;

    const gradedRows = await this.db
      .select({
        activityId: schema.grades.activityId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.grades)
      .where(eq(schema.grades.courseId, courseId))
      .groupBy(schema.grades.activityId);

    const gradedByActivity = new Map<string, number>();
    for (const g of gradedRows) {
      if (g.activityId) gradedByActivity.set(g.activityId, g.count);
    }

    return activities.map((a) => ({
      ...a,
      totalStudents,
      gradedCount: gradedByActivity.get(a.id) ?? 0,
    }));
  }

  async create(input: {
    courseId: string;
    createdBy: string;
    title: string;
    description?: string;
    category?: string;
    maxScore?: number;
    weight?: number;
    dueDate?: Date;
  }) {
    const [row] = await this.db
      .insert(schema.courseActivities)
      .values({
        courseId: input.courseId,
        createdBy: input.createdBy,
        title: input.title,
        description: input.description,
        category: input.category ?? 'actividad',
        maxScore: String(input.maxScore ?? 100),
        weight: String(input.weight ?? 1),
        dueDate: input.dueDate,
      })
      .returning();
    return row!;
  }

  async delete(id: string) {
    await this.db.delete(schema.courseActivities).where(eq(schema.courseActivities.id, id));
  }

  /** Todos los estudiantes matriculados (activos) del curso de la actividad,
   *  con su nota para esa actividad si ya fue calificada (izquierda). Sirve para
   *  la grilla de calificación: quién falta ("Pendiente") y quién ya tiene nota. */
  async listActivityGrades(activityId: string, courseId: string) {
    const rows = await this.db
      .select({
        enrollmentId: schema.enrollments.id,
        studentId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        avatarUrl: schema.users.avatarUrl,
        gradeId: schema.grades.id,
        score: schema.grades.score,
        maxScore: schema.grades.maxScore,
        feedback: schema.grades.feedback,
        gradedAt: schema.grades.gradedAt,
      })
      .from(schema.enrollments)
      .innerJoin(schema.users, eq(schema.enrollments.userId, schema.users.id))
      .leftJoin(
        schema.grades,
        and(
          eq(schema.grades.enrollmentId, schema.enrollments.id),
          eq(schema.grades.activityId, activityId),
        ),
      )
      .where(
        and(eq(schema.enrollments.courseId, courseId), eq(schema.enrollments.status, 'active')),
      );

    return rows.map((r) => ({
      enrollmentId: r.enrollmentId,
      studentId: r.studentId,
      studentName: `${r.firstName} ${r.lastName}`.trim(),
      avatarUrl: r.avatarUrl,
      gradeId: r.gradeId,
      score: r.score,
      maxScore: r.maxScore,
      feedback: r.feedback,
      gradedAt: r.gradedAt,
    }));
  }

  /** Registra o actualiza la nota de un estudiante para una actividad. La nota se
   *  denormaliza en `grades` (con `activityId` + `title` de la actividad) para que
   *  el boletín del estudiante y `avgGrade` la incluyan sin cambios. */
  async upsertGrade(input: {
    activityId: string;
    studentId: string;
    teacherId: string;
    courseId: string;
    enrollmentId: string;
    title: string;
    score: number;
    maxScore: number;
    weight: number;
    feedback?: string;
  }) {
    const [existing] = await this.db
      .select({ id: schema.grades.id })
      .from(schema.grades)
      .where(
        and(
          eq(schema.grades.activityId, input.activityId),
          eq(schema.grades.enrollmentId, input.enrollmentId),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await this.db
        .update(schema.grades)
        .set({
          score: String(input.score),
          maxScore: String(input.maxScore),
          weight: String(input.weight),
          title: input.title,
          feedback: input.feedback,
          gradedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.grades.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await this.db
      .insert(schema.grades)
      .values({
        studentId: input.studentId,
        teacherId: input.teacherId,
        courseId: input.courseId,
        enrollmentId: input.enrollmentId,
        activityId: input.activityId,
        title: input.title,
        score: String(input.score),
        maxScore: String(input.maxScore),
        weight: String(input.weight),
        feedback: input.feedback,
      })
      .returning();
    return row!;
  }
}
